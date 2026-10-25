// The AI port (docs/plans/ai-assist-plan.md R1): every job embeds or asks for JSON through
// these three functions, and a connection (lib/ai/connections.ts) picks the adapter.
// Two adapters: Gemini's own API, and any OpenAI-compatible server (Ollama, vLLM or
// LM Studio on the lab server, Groq or OpenRouter, or Gemini's OpenAI endpoint).
// Adding a provider means adding an adapter here; jobs never change.
// Every text is PII-scrubbed before it leaves (FR-AI-04); models get no tools (R4).
import { scrubPii } from "@/lib/ai/scrubPii";
import type { AiConnection } from "@/lib/ai/connections";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const EMBEDDING_DIM = 768; // must match daily_report_entries.embedding_vector
// Embeddings answer in about a second. Chat models think first: a measured call took 29 s,
// so chat gets far longer before it counts as a failure (and towards a pause, R2).
const EMBED_TIMEOUT_MS = 20_000;
const CHAT_TIMEOUT_MS = 60_000;

export class AiProviderError extends Error {
  // HTTP status from the provider, when there was a response; 400 means it rejected this input.
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

function keyOf(conn: AiConnection): string | undefined {
  return conn.keyEnv ? process.env[conn.keyEnv] || undefined : undefined;
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  what: string,
  timeoutMs = EMBED_TIMEOUT_MS
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new AiProviderError(
      `${what} failed (${res.status}): ${json.error?.message ?? "unknown"}`,
      res.status
    );
  }
  return json;
}

function gemini(
  conn: AiConnection,
  model: string,
  method: string,
  body: unknown,
  timeoutMs?: number
) {
  const key = keyOf(conn);
  if (!key) throw new AiProviderError(`${conn.keyEnv ?? "The API key variable"} is not set`);
  return post(
    `${GEMINI_BASE}/${model}:${method}`,
    { "x-goog-api-key": key }, // a header, never the URL (URLs get logged)
    body,
    `Gemini ${model}:${method}`,
    timeoutMs
  );
}

function openAi(conn: AiConnection, path: string, body: unknown, timeoutMs?: number) {
  const base = conn.baseUrl?.replace(/\/+$/, "");
  if (!base) throw new AiProviderError(`${conn.name} has no base URL`);
  const key = keyOf(conn); // a local Ollama needs none
  return post(
    `${base}${path}`,
    key ? { authorization: `Bearer ${key}` } : {},
    body,
    `AI ${path}`,
    timeoutMs
  );
}

function checkVectors(vectors: unknown[], count: number): number[][] {
  if (
    vectors.length !== count ||
    vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIM)
  ) {
    throw new AiProviderError(`Expected ${count} ${EMBEDDING_DIM}-dim embeddings`);
  }
  return vectors as number[][];
}

// One call per batch (not one per text), so a week fits inside the route and cron limits.
export async function embedTexts(
  conn: AiConnection,
  texts: string[],
  opts: { names?: string[] } = {}
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const clean = texts.map((t) => scrubPii(t, opts));
  if (conn.provider === "openai") {
    const json = (await openAi(conn, "/embeddings", {
      model: conn.embeddingModel,
      input: clean,
      dimensions: EMBEDDING_DIM,
    })) as { data?: { index?: number; embedding?: number[] }[] };
    const sorted = [...(json.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return checkVectors(
      sorted.map((d) => d.embedding),
      texts.length
    );
  }
  const json = (await gemini(conn, conn.embeddingModel, "batchEmbedContents", {
    requests: clean.map((text) => ({
      model: `models/${conn.embeddingModel}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIM,
    })),
  })) as { embeddings?: { values?: number[] }[] };
  return checkVectors(
    (json.embeddings ?? []).map((e) => e.values),
    texts.length
  );
}

export async function embedText(
  conn: AiConnection,
  text: string,
  opts: { names?: string[] } = {}
): Promise<number[]> {
  return (await embedTexts(conn, [text], opts))[0];
}

// JSON mode at temperature 0. The prompt is built by lib/ai/guard.ts (fenced data,
// fixed format); the caller validates the result against its own schema and drops
// anything else (R4).
export async function chatJson(conn: AiConnection, prompt: string): Promise<unknown> {
  let raw: string | undefined;
  if (conn.provider === "openai") {
    const json = (await openAi(
      conn,
      "/chat/completions",
      {
        model: conn.chatModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: { type: "json_object" },
      },
      CHAT_TIMEOUT_MS
    )) as { choices?: { message?: { content?: string } }[] };
    raw = json.choices?.[0]?.message?.content;
  } else {
    const json = (await gemini(
      conn,
      conn.chatModel,
      "generateContent",
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      },
      CHAT_TIMEOUT_MS
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  }
  try {
    return JSON.parse(raw ?? "");
  } catch {
    throw new AiProviderError("The model's answer was not JSON");
  }
}
