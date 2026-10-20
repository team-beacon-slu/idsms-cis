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
    { id: "a" },
    { id: "b" },
    { id: "c" },
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
    expect.objectContaining({ where: expect.objectContaining({ aiProcessedAt: null }), take: 20 })
  );
});
