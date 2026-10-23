import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/ai/aiService", () => ({
  embedTexts: jest.fn(),
  classifySentiment: jest.fn(),
}));
jest.mock("@/lib/ai/settings", () => ({ getAiSettings: jest.fn() }));

import { classifySentiment, embedTexts } from "@/lib/services/ai/aiService";
import { getAiSettings } from "@/lib/ai/settings";
import { processWeeklyReportAi } from "@/lib/ai/processing";

const settings = {
  enabled: true,
  similarityThreshold: 0.7,
  minSentimentConfidence: 0.6,
  privacyApprovedBy: "Adviser",
  lastEval: null,
};
const report = {
  id: "wr-2",
  studentProfileId: "p-1",
  weekStart: new Date("2026-10-12T00:00:00Z"),
  revisionHistory: [{ type: "SUBMITTED", timestamp: "t" }],
  studentProfile: { fullName: "Juan Dela Cruz" },
  dailyEntries: [
    { id: "e-1", accomplishments: "Built the login page" },
    { id: "e-2", accomplishments: null },
  ],
};

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  (getAiSettings as jest.Mock).mockResolvedValue(settings);
  (embedTexts as jest.Mock).mockResolvedValue([Array(768).fill(0.1)]);
  prismaMock.weeklyReport.count.mockResolvedValue(0);
  (classifySentiment as jest.Mock).mockResolvedValue({
    label: "POSITIVE",
    confidence: 0.8,
    reasoning: "Good progress.",
  });
  prismaMock.weeklyReport.findUnique.mockResolvedValue(report as never);
  prismaMock.$executeRaw.mockResolvedValue(1 as never);
});

it("does nothing while ai:enabled is false", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ ...settings, enabled: false });
  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual({
    processed: false,
    reason: "AI is disabled",
  });
  expect(embedTexts).not.toHaveBeenCalled();
  expect(classifySentiment).not.toHaveBeenCalled();
});

it("skips reports that were never submitted (drafts)", async () => {
  prismaMock.weeklyReport.findUnique.mockResolvedValue({ ...report, revisionHistory: [] } as never);
  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual(
    expect.objectContaining({ processed: false })
  );
  expect(embedTexts).not.toHaveBeenCalled();
});

it("embeds only non-empty entries, scores similarity, classifies, and caches — never touching status", async () => {
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: 0.83 }] as never);

  const result = await processWeeklyReportAi("wr-2");

  expect(embedTexts).toHaveBeenCalledTimes(1);
  expect(embedTexts).toHaveBeenCalledWith(["Built the login page"], { names: ["Juan Dela Cruz"] });
  expect(result).toEqual({ processed: true, similarityScore: 0.83, sentimentLabel: "POSITIVE" });
  const update = prismaMock.weeklyReport.update.mock.calls[0][0] as {
    data: Record<string, unknown>;
  };
  expect(update.data).toEqual(
    expect.objectContaining({
      similarityScore: 0.83,
      similarityFlag: true,
      sentimentLabel: "POSITIVE",
      sentimentConfidence: 0.8,
      sentimentReasoning: "Good progress.",
      aiProcessedAt: expect.any(Date),
    })
  );
  expect(update.data).not.toHaveProperty("status");
  expect(update.data).not.toHaveProperty("facultyAction");
});

it("processes a submission once (re-posting can't burn quota)", async () => {
  prismaMock.weeklyReport.findUnique.mockResolvedValue({
    ...report,
    aiProcessedAt: new Date("2026-10-20T00:00:00Z"),
  } as never);
  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual(
    expect.objectContaining({ processed: false, reason: "Already processed" })
  );
  expect(embedTexts).not.toHaveBeenCalled();
});

it("waits until the student's earlier submitted weeks are processed", async () => {
  prismaMock.weeklyReport.count.mockResolvedValue(2);
  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual(
    expect.objectContaining({ processed: false, reason: "Earlier weeks not processed yet" })
  );
  expect(prismaMock.weeklyReport.count).toHaveBeenCalledWith({
    where: expect.objectContaining({
      studentProfileId: "p-1",
      weekStart: { lt: report.weekStart },
      aiProcessedAt: null,
    }),
  });
  expect(embedTexts).not.toHaveBeenCalled();
});

it("first report has no similarity score", async () => {
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: null }] as never);
  const result = await processWeeklyReportAi("wr-2");
  expect(result.similarityScore).toBeNull();
  const update = prismaMock.weeklyReport.update.mock.calls[0][0] as {
    data: Record<string, unknown>;
  };
  expect(update.data).toEqual(
    expect.objectContaining({ similarityScore: null, similarityFlag: false })
  );
});

it("leaves the report unprocessed (retryable) when the provider fails", async () => {
  (classifySentiment as jest.Mock).mockRejectedValue(new Error("quota"));
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: 0.2 }] as never);
  await expect(processWeeklyReportAi("wr-2")).rejects.toThrow("quota");
  expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
});

it("clears the report's old vectors before storing the new ones", async () => {
  // A day emptied on resubmission (e.g. now Absent) must not keep comparing as its old text.
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: null }] as never);
  await processWeeklyReportAi("wr-2");

  const sql = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?");
  const calls = prismaMock.$executeRaw.mock.calls as unknown[][];
  expect(sql(calls[0])).toContain("SET embedding_vector = NULL");
  expect(calls[0]).toContain("wr-2");
  expect(sql(calls[1])).toContain("SET embedding_vector =");
});

it("records a content rejection (400) so the student's later weeks aren't blocked forever", async () => {
  (embedTexts as jest.Mock).mockRejectedValue(
    Object.assign(new Error("Gemini embed failed (400): invalid argument"), { status: 400 })
  );

  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual({
    processed: false,
    reason: "Rejected by the AI provider",
  });
  expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith({
    where: { id: "wr-2" },
    data: expect.objectContaining({
      similarityScore: null,
      similarityFlag: false,
      sentimentLabel: null,
      sentimentReasoning: expect.stringContaining("could not analyse"),
      aiProcessedAt: expect.any(Date),
    }),
  });
});

it.each([429, 500, 403, undefined])(
  "keeps a %p failure retryable: throws without marking the report processed",
  async (status) => {
    (embedTexts as jest.Mock).mockRejectedValue(
      Object.assign(new Error("Gemini failed"), { status })
    );

    await expect(processWeeklyReportAi("wr-2")).rejects.toThrow("Gemini failed");
    expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
  }
);
