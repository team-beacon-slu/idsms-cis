import {
  AiProviderError,
  classifySentiment,
  embedText,
  embedTexts,
} from "@/lib/services/ai/aiService";

const fetchMock = jest.fn();
const ENV = { ...process.env };
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as never;
  process.env = { ...ENV, GEMINI_API_KEY: "test-key" };
  delete process.env.GEMINI_EMBEDDING_MODEL;
  delete process.env.GEMINI_SENTIMENT_MODEL;
});
afterAll(() => {
  process.env = ENV;
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

it("embeds with a 768-dim request, key in a header (never the URL)", async () => {
  fetchMock.mockResolvedValue(ok({ embedding: { values: Array(768).fill(0.1) } }));
  const v = await embedText("Built the login page");
  expect(v).toHaveLength(768);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain("gemini-embedding-001:embedContent");
  expect(url).not.toContain("test-key");
  expect(init.headers["x-goog-api-key"]).toBe("test-key");
  expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ outputDimensionality: 768 }));
});

it("scrubs PII before sending", async () => {
  fetchMock.mockResolvedValue(ok({ embedding: { values: Array(768).fill(0) } }));
  await embedText("Email me at juan@slu.edu.ph");
  expect(fetchMock.mock.calls[0][1].body).not.toContain("juan@slu.edu.ph");
});

it("embeds many texts in one batch call, scrubbed, in order", async () => {
  fetchMock.mockResolvedValue(
    ok({ embeddings: [{ values: Array(768).fill(1) }, { values: Array(768).fill(2) }] })
  );
  const vs = await embedTexts(["Day one", "Mail juan@slu.edu.ph"]);
  expect(vs.map((v) => v[0])).toEqual([1, 2]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain("gemini-embedding-001:batchEmbedContents");
  expect(init.body).not.toContain("juan@slu.edu.ph");
  expect(JSON.parse(init.body).requests).toHaveLength(2);
});

it("rejects a batch with the wrong number of embeddings", async () => {
  fetchMock.mockResolvedValue(ok({ embeddings: [{ values: Array(768).fill(1) }] }));
  await expect(embedTexts(["a", "b"])).rejects.toThrow(AiProviderError);
});

it("rejects a wrong-dimension embedding", async () => {
  fetchMock.mockResolvedValue(ok({ embedding: { values: [0.1, 0.2] } }));
  await expect(embedText("x")).rejects.toThrow(AiProviderError);
});

it("parses a JSON-mode sentiment response", async () => {
  fetchMock.mockResolvedValue(
    ok({
      candidates: [
        {
          content: {
            parts: [
              { text: '{"label":"POSITIVE","confidence":0.82,"reasoning":"Upbeat progress."}' },
            ],
          },
        },
      ],
    })
  );
  await expect(classifySentiment("Great week")).resolves.toEqual({
    label: "POSITIVE",
    confidence: 0.82,
    reasoning: "Upbeat progress.",
  });
});

it("rejects a malformed sentiment response", async () => {
  fetchMock.mockResolvedValue(
    ok({ candidates: [{ content: { parts: [{ text: '{"label":"HAPPY","confidence":3}' }] } }] })
  );
  await expect(classifySentiment("x")).rejects.toThrow(AiProviderError);
});

it("surfaces HTTP errors as AiProviderError without leaking the key", async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: "quota" } }),
  });
  await expect(embedText("x")).rejects.toThrow(/429/);
  await expect(embedText("x")).rejects.not.toThrow(/test-key/);
});

it("refuses to call out when GEMINI_API_KEY is missing", async () => {
  delete process.env.GEMINI_API_KEY;
  await expect(embedText("x")).rejects.toThrow(AiProviderError);
  expect(fetchMock).not.toHaveBeenCalled();
});

describe("OpenAI-compatible adapter (AI_PROVIDER=openai)", () => {
  beforeEach(() => {
    Object.assign(process.env, {
      AI_PROVIDER: "openai",
      AI_BASE_URL: "http://ollama:11434/v1/",
      AI_EMBEDDING_MODEL: "nomic-embed-text-v2-moe",
      AI_CHAT_MODEL: "gemma3:4b",
    });
    delete process.env.AI_API_KEY;
  });

  it("embeds a batch, scrubbed, back in input order, with no key header for a local server", async () => {
    fetchMock.mockResolvedValue(
      ok({
        data: [
          { index: 1, embedding: Array(768).fill(2) },
          { index: 0, embedding: Array(768).fill(1) },
        ],
      })
    );
    const vectors = await embedTexts(["a juan@slu.edu.ph", "b"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ollama:11434/v1/embeddings");
    expect(init.headers.authorization).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "nomic-embed-text-v2-moe", dimensions: 768 });
    expect(init.body).not.toContain("juan@slu.edu.ph");
    expect(vectors.map((v) => v[0])).toEqual([1, 2]);
  });

  it("sends the key as a bearer token when one is set", async () => {
    process.env.AI_API_KEY = "k";
    fetchMock.mockResolvedValue(ok({ data: [{ index: 0, embedding: Array(768).fill(0) }] }));
    await embedText("x");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer k");
  });

  it("rejects wrong-dimension embeddings", async () => {
    fetchMock.mockResolvedValue(ok({ data: [{ index: 0, embedding: [0.1] }] }));
    await expect(embedText("x")).rejects.toThrow(AiProviderError);
  });

  it("classifies sentiment through chat completions in JSON mode", async () => {
    fetchMock.mockResolvedValue(
      ok({
        choices: [
          {
            message: {
              content: JSON.stringify({ label: "NEUTRAL", confidence: 0.8, reasoning: "Routine." }),
            },
          },
        ],
      })
    );
    await expect(classifySentiment("did tasks")).resolves.toEqual({
      label: "NEUTRAL",
      confidence: 0.8,
      reasoning: "Routine.",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ollama:11434/v1/chat/completions");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "gemma3:4b",
      temperature: 0,
      response_format: { type: "json_object" },
    });
  });

  it("refuses to call out without a base URL", async () => {
    delete process.env.AI_BASE_URL;
    await expect(embedText("x")).rejects.toThrow(/AI_BASE_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
