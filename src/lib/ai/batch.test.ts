import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";

jest.mock("@/lib/ai/settings", () => ({ getAiSettings: jest.fn() }));
jest.mock("@/lib/ai/processing", () => ({ processWeeklyReportAi: jest.fn() }));

import { getAiSettings } from "@/lib/ai/settings";
import { processWeeklyReportAi } from "@/lib/ai/processing";
import { processPendingAiReports } from "@/lib/ai/batch";

beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

it("does nothing while ai:enabled is false", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ enabled: false });
  await expect(processPendingAiReports()).resolves.toEqual({
    processed: 0,
    failed: 0,
    skipped: true,
  });
  expect(prismaMock.weeklyReport.findMany).not.toHaveBeenCalled();
});

it("processes unprocessed reports one at a time, capped, continuing past failures", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ enabled: true });
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    { id: "a", studentProfileId: "p-1" },
    { id: "b", studentProfileId: "p-2" },
    { id: "c", studentProfileId: "p-3" },
  ] as never);
  (processWeeklyReportAi as jest.Mock)
    .mockResolvedValueOnce({ processed: true })
    .mockRejectedValueOnce(new Error("quota"))
    .mockResolvedValueOnce({ processed: false, reason: "Report not submitted" });

  await expect(processPendingAiReports(20)).resolves.toEqual({
    processed: 1,
    failed: 1,
    skipped: false,
  });
  expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      // only submitted weeks, so drafts can't crowd out real work
      where: expect.objectContaining({
        aiProcessedAt: null,
        revisionHistory: { array_contains: [{ type: "SUBMITTED" }] },
      }),
      take: 100, // 5x the cap: blocked reports are skipped without using it
    })
  );
});

it("doesn't let reports waiting on earlier weeks use up the daily budget", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ enabled: true });
  prismaMock.weeklyReport.findMany.mockResolvedValue(
    ["a", "b", "c", "d", "e"].map((id) => ({ id, studentProfileId: `p-${id}` })) as never
  );
  (processWeeklyReportAi as jest.Mock)
    .mockResolvedValueOnce({ processed: false, reason: "Earlier weeks not processed yet" })
    .mockResolvedValueOnce({ processed: false, reason: "Earlier weeks not processed yet" })
    .mockResolvedValue({ processed: true });

  await expect(processPendingAiReports(2)).resolves.toEqual(
    expect.objectContaining({ processed: 2, failed: 0 })
  );
  expect(processWeeklyReportAi).toHaveBeenCalledTimes(4); // e is left for tomorrow
});

it("after a failure, skips that student's later weeks for the rest of the run", async () => {
  (getAiSettings as jest.Mock).mockResolvedValue({ enabled: true });
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    { id: "a", studentProfileId: "p-1" },
    { id: "b", studentProfileId: "p-1" },
    { id: "c", studentProfileId: "p-2" },
  ] as never);
  (processWeeklyReportAi as jest.Mock)
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValue({ processed: true });

  await expect(processPendingAiReports(20)).resolves.toEqual(
    expect.objectContaining({ processed: 1, failed: 1 })
  );
  expect(processWeeklyReportAi).toHaveBeenCalledTimes(2);
  expect(processWeeklyReportAi).not.toHaveBeenCalledWith("b");
});
