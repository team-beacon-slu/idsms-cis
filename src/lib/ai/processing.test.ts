import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/services/aiService", () => ({
  embedText: jest.fn(),
  classifySentiment: jest.fn(),
}));
jest.mock("@/lib/ai/settings", () => ({ getAiSettings: jest.fn() }));

import { classifySentiment, embedText } from "@/lib/services/aiService";
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
  (embedText as jest.Mock).mockResolvedValue(Array(768).fill(0.1));
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
  expect(embedText).not.toHaveBeenCalled();
  expect(classifySentiment).not.toHaveBeenCalled();
});

it("skips reports that were never submitted (drafts)", async () => {
  prismaMock.weeklyReport.findUnique.mockResolvedValue({ ...report, revisionHistory: [] } as never);
  await expect(processWeeklyReportAi("wr-2")).resolves.toEqual(
    expect.objectContaining({ processed: false })
  );
  expect(embedText).not.toHaveBeenCalled();
});

it("embeds only non-empty entries, scores similarity, classifies, and caches — never touching status", async () => {
  prismaMock.$queryRaw.mockResolvedValue([{ max_similarity: 0.83 }] as never);

  const result = await processWeeklyReportAi("wr-2");

  expect(embedText).toHaveBeenCalledTimes(1);
  expect(embedText).toHaveBeenCalledWith("Built the login page", { names: ["Juan Dela Cruz"] });
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
