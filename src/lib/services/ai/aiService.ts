// Similarity detection (Gemini embeddings + pgvector) and sentiment analysis
// (Gemini Flash), behind a swappable adapter per NFR-MNT-02/NFR-MNT-05.
// See PRD Module 9 (FR-AI-*) and NFR-AI-01..04 (golden set, precision/recall targets).
// Models come from env vars because Google retires them: text-embedding-004
// and gemini-2.5-flash were both gone by 2026-10-21 (R16).
import { z } from "zod";
import { scrubPii } from "@/lib/ai/scrubPii";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBEDDING_DIM = 768; // must match daily_report_entries.embedding_vector
const TIMEOUT_MS = 15_000;
export const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
// Pinned (not "-latest") so the golden-set evaluation stays reproducible.
export const DEFAULT_SENTIMENT_MODEL = "gemini-3.8-flash";

export class AiProviderError extends Error {
  // HTTP status from Gemini, when there was a response; 400 means it rejected this input.
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

async function callGemini(model: string, method: string, body: unknown): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiProviderError("GEMINI_API_KEY is not configured");
  const res = await fetch(`${API_BASE}/${model}:${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new AiProviderError(
      `Gemini ${model}:${method} failed (${res.status}): ${json.error?.message ?? "unknown"}`,
      res.status
    );
  }
  return json;
}

// The AI port's second adapter (ai-assist-plan R1): any OpenAI-compatible server — Ollama
// or vLLM on the lab server, or Gemini's own OpenAI endpoint on the beta — so the beta runs
// the exact code path the rollout will. AI_PROVIDER=openai switches to it; Gemini stays the default.
const openAiSelected = () => process.env.AI_PROVIDER === "openai";

async function callOpenAi(path: string, body: unknown): Promise<unknown> {
  const base = process.env.AI_BASE_URL?.replace(/\/+$/, "");
  if (!base) throw new AiProviderError("AI_BASE_URL is not configured");
  const key = process.env.AI_API_KEY; // a local Ollama needs none
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new AiProviderError(
      `AI ${path} failed (${res.status}): ${json.error?.message ?? "unknown"}`,
      res.status
    );
  }
  return json;
}

async function openAiEmbed(inputs: string[]): Promise<number[][]> {
  const model = process.env.AI_EMBEDDING_MODEL;
  if (!model) throw new AiProviderError("AI_EMBEDDING_MODEL is not configured");
  const json = (await callOpenAi("/embeddings", {
    model,
    input: inputs,
    dimensions: EMBEDDING_DIM,
  })) as { data?: { index?: number; embedding?: number[] }[] };
  const vectors = [...(json.data ?? [])]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding);
  if (
    vectors.length !== inputs.length ||
    vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIM)
  ) {
    throw new AiProviderError(`Expected ${inputs.length} ${EMBEDDING_DIM}-dim embeddings`);
  }
  return vectors as number[][];
}

export async function embedText(text: string, opts: { names?: string[] } = {}): Promise<number[]> {
  if (openAiSelected()) return (await openAiEmbed([scrubPii(text, opts)]))[0];
  const model = process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const json = (await callGemini(model, "embedContent", {
    model: `models/${model}`,
    content: { parts: [{ text: scrubPii(text, opts) }] },
    outputDimensionality: EMBEDDING_DIM,
  })) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new AiProviderError(
      `Expected a ${EMBEDDING_DIM}-dim embedding, got ${values?.length ?? "none"}`
    );
  }
  return values;
}

// One batchEmbedContents call per report (not one call per day), so a week
// fits comfortably inside the route and cron time limits.
export async function embedTexts(
  texts: string[],
  opts: { names?: string[] } = {}
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (openAiSelected()) return openAiEmbed(texts.map((text) => scrubPii(text, opts)));
  const model = process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const json = (await callGemini(model, "batchEmbedContents", {
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text: scrubPii(text, opts) }] },
      outputDimensionality: EMBEDDING_DIM,
    })),
  })) as { embeddings?: { values?: number[] }[] };
  const vectors = json.embeddings?.map((e) => e.values);
  if (
    !vectors ||
    vectors.length !== texts.length ||
    vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIM)
  ) {
    throw new AiProviderError(`Expected ${texts.length} ${EMBEDDING_DIM}-dim embeddings`);
  }
  return vectors as number[][];
}

const sentimentSchema = z.object({
  label: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().trim().min(1).max(400),
});
export type SentimentResult = z.infer<typeof sentimentSchema>;

const SENTIMENT_PROMPT =
  "Classify the overall sentiment of this internship weekly report written by a student. " +
  'Respond only with JSON: {"label": "POSITIVE"|"NEUTRAL"|"NEGATIVE", "confidence": 0..1, ' +
  '"reasoning": one short sentence}. This is advisory for a faculty adviser and must not judge the student.\n\nReport:\n';

export async function classifySentiment(
  text: string,
  opts: { names?: string[] } = {}
): Promise<SentimentResult> {
  const prompt = SENTIMENT_PROMPT + scrubPii(text, opts);
  let raw: string | undefined;
  if (openAiSelected()) {
    const model = process.env.AI_CHAT_MODEL;
    if (!model) throw new AiProviderError("AI_CHAT_MODEL is not configured");
    const json = (await callOpenAi("/chat/completions", {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    })) as { choices?: { message?: { content?: string } }[] };
    raw = json.choices?.[0]?.message?.content;
  } else {
    const model = process.env.GEMINI_SENTIMENT_MODEL || DEFAULT_SENTIMENT_MODEL;
    const json = (await callGemini(model, "generateContent", {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    throw new AiProviderError("Sentiment response was not JSON");
  }
  const result = sentimentSchema.safeParse(parsed);
  if (!result.success) throw new AiProviderError("Sentiment response failed validation");
  return result.data;
}
