import { AiProviderError, chatJson, embedText, embedTexts } from "@/lib/services/ai/aiService";
import type { AiConnection } from "@/lib/ai/connections";

const fetchMock = jest.fn();
const ENV = { ...process.env };
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as never;
  process.env = { ...ENV, GEMINI_API_KEY: "test-key", LAB_API_KEY: "k" };
});
afterAll(() => {
  process.env = ENV;
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const gemini: AiConnection = {
  name: "Gemini",
  provider: "gemini",
  keyEnv: "GEMINI_API_KEY",
  embeddingModel: "gemini-embedding-001",
  chatModel: "gemini-3.8-flash",
};
const ollama: AiConnection = {
  name: "Lab",
  provider: "openai",
  baseUrl: "http://ollama:11434/v1/",
  embeddingModel: "nomic-embed-text-v2-moe",
  chatModel: "gemma3:4b",
};

describe("Gemini adapter", () => {
  it("embeds a batch in one call, 768 dims, key in a header (never the URL)", async () => {
    fetchMock.mockResolvedValue(
      ok({ embeddings: [{ values: Array(768).fill(1) }, { values: Array(768).fill(2) }] })
    );
    const vectors = await embedTexts(gemini, ["a", "b"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("gemini-embedding-001:batchEmbedContents");
    expect(url).not.toContain("test-key");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body).requests[0].outputDimensionality).toBe(768);
    expect(vectors.map((v) => v[0])).toEqual([1, 2]);
  });

  it("scrubs PII before sending", async () => {
    fetchMock.mockResolvedValue(ok({ embeddings: [{ values: Array(768).fill(0) }] }));
    await embedText(gemini, "email juan@slu.edu.ph about it");
    expect(fetchMock.mock.calls[0][1].body).not.toContain("juan@slu.edu.ph");
  });

  it("rejects the wrong number or size of embeddings", async () => {
    fetchMock.mockResolvedValue(ok({ embeddings: [{ values: [0.1, 0.2] }] }));
    await expect(embedText(gemini, "x")).rejects.toThrow(AiProviderError);
    fetchMock.mockResolvedValue(ok({ embeddings: [{ values: Array(768).fill(1) }] }));
    await expect(embedTexts(gemini, ["a", "b"])).rejects.toThrow(AiProviderError);
  });

  it("parses JSON-mode chat answers", async () => {
    fetchMock.mockResolvedValue(
      ok({ candidates: [{ content: { parts: [{ text: '{"id": 2}' }] } }] })
    );
    await expect(chatJson(gemini, "prompt")).resolves.toEqual({ id: 2 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json", temperature: 0 });
  });

  it("rejects an answer that isn't JSON", async () => {
    fetchMock.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }));
    await expect(chatJson(gemini, "p")).rejects.toThrow(/not JSON/);
  });

  it("surfaces HTTP errors with their status, without the key", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "bad input" } }),
    });
    const error = await embedText(gemini, "x").catch((e) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.status).toBe(400);
    expect(error.message).not.toContain("test-key");
  });

  it("refuses to call out when its key variable is empty", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(embedText(gemini, "x")).rejects.toThrow(/GEMINI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("OpenAI-compatible adapter", () => {
  it("embeds in input order, with no key header for a keyless local server", async () => {
    fetchMock.mockResolvedValue(
      ok({
        data: [
          { index: 1, embedding: Array(768).fill(2) },
          { index: 0, embedding: Array(768).fill(1) },
        ],
      })
    );
    const vectors = await embedTexts(ollama, ["a juan@slu.edu.ph", "b"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ollama:11434/v1/embeddings");
    expect(init.headers.authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toMatchObject({
      model: "nomic-embed-text-v2-moe",
      dimensions: 768,
    });
    expect(init.body).not.toContain("juan@slu.edu.ph");
    expect(vectors.map((v) => v[0])).toEqual([1, 2]);
  });

  it("sends the key as a bearer token when the connection names one", async () => {
    fetchMock.mockResolvedValue(ok({ data: [{ index: 0, embedding: Array(768).fill(0) }] }));
    await embedText({ ...ollama, keyEnv: "LAB_API_KEY" }, "x");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer k");
  });

  it("asks chat completions for JSON at temperature 0", async () => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '{"id": null}' } }] }));
    await expect(chatJson(ollama, "p")).resolves.toEqual({ id: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://ollama:11434/v1/chat/completions");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "gemma3:4b",
      temperature: 0,
      response_format: { type: "json_object" },
    });
  });

  it("refuses to call out without a base URL", async () => {
    await expect(embedText({ ...ollama, baseUrl: undefined }, "x")).rejects.toThrow(/base URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
