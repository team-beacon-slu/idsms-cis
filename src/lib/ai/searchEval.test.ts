import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/ai/aiService", () => ({ embedTexts: jest.fn() }));
jest.mock("@/lib/ai/connections", () => ({ getConnections: jest.fn() }));

import { embedTexts } from "@/lib/services/ai/aiService";
import { getConnections } from "@/lib/ai/connections";
import { AiConfigError, runSearchEval } from "@/lib/ai/admin";
import { SEARCH_EVAL } from "@/lib/ai/testsets";

const conn = { name: "Gemini", provider: "gemini", embeddingModel: "gemini-embedding-001" };

beforeEach(() => {
  resetPrismaMock();
  (getConnections as jest.Mock).mockResolvedValue({ general: conn, private: conn });
  (embedTexts as jest.Mock).mockResolvedValue(SEARCH_EVAL.map(() => Array(768).fill(0.1)));
});

it("scores precision@5 against each query's demo company and stores it with the model", async () => {
  let call = 0;
  prismaMock.$queryRaw.mockImplementation((() => {
    const right = SEARCH_EVAL[call++].company;
    // 4 of 5 from the right company, the lowest right hit at 0.61
    return Promise.resolve([
      { company: right, score: 0.8 },
      { company: right, score: 0.7 },
      { company: right, score: 0.66 },
      { company: right, score: 0.61 },
      { company: "DEMO Other", score: 0.6 },
    ]);
  }) as never);
  const r = await runSearchEval("admin-1");
  expect(r).toEqual(
    expect.objectContaining({
      model: "gemini-embedding-001",
      queries: SEARCH_EVAL.length,
      precisionAt5: 0.8,
      minRelevantScore: 0.61,
    })
  );
  expect(prismaMock.systemConfig.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ where: { configKey: "ai:search_eval" } })
  );
});

it("says so when the demo entries haven't been embedded yet", async () => {
  prismaMock.$queryRaw.mockResolvedValue([] as never);
  await expect(runSearchEval("admin-1")).rejects.toThrow(AiConfigError);
});

it("needs the connection allowed to read interns' words", async () => {
  (getConnections as jest.Mock).mockResolvedValue({ general: conn, private: null });
  await expect(runSearchEval("admin-1")).rejects.toThrow(/interns' words/);
});

it("has English and Taglish queries for every demo company", () => {
  const companies = new Set(SEARCH_EVAL.map((q) => q.company));
  expect(companies.size).toBe(6);
  expect(SEARCH_EVAL.filter((q) => /\b(ng|sa|nag-)/.test(q.query)).length).toBe(6);
});
