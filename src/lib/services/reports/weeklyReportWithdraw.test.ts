import { WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  isWeeklyReportEditable,
  withdrawWeeklyReportSubmission,
  WeeklyReportWithdrawError,
} from "./weeklyReportService";

// Week of Oct 5-11, 2026: due Tue Oct 13, 11:59 PM Manila.
const weekEnd = new Date("2026-10-11T00:00:00Z");
const submitted = [{ type: "SUBMITTED", timestamp: "2026-10-12T02:00:00Z", referenceCode: "WR-1" }];
const beforeDeadline = new Date("2026-10-13T05:00:00Z");
const afterDeadline = new Date("2026-10-14T05:00:00Z");

describe("withdrawWeeklyReportSubmission (Q21)", () => {
  beforeEach(() => {
    resetPrismaMock();
    prismaMock.$queryRaw.mockResolvedValue([] as never);
  });

  it("takes a submitted, unreviewed week back to draft before the deadline", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd,
      revisionHistory: submitted,
    } as never);
    await withdrawWeeklyReportSubmission("wr-1", { id: "student-1" }, beforeDeadline);
    const history = (
      prismaMock.weeklyReport.update.mock.calls[0][0].data as { revisionHistory: unknown[] }
    ).revisionHistory;
    expect(history).toEqual([...submitted, expect.objectContaining({ type: "WITHDRAWN" })]);
    expect(
      isWeeklyReportEditable({ status: WeeklyReportStatus.PENDING, revisionHistory: history })
    ).toBe(true);
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("refuses after the deadline", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      weekEnd,
      revisionHistory: submitted,
    } as never);
    await expect(
      withdrawWeeklyReportSubmission("wr-1", { id: "student-1" }, afterDeadline)
    ).rejects.toThrow(WeeklyReportWithdrawError);
  });

  it("refuses a week the adviser already reviewed", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.APPROVED,
      weekEnd,
      revisionHistory: submitted,
    } as never);
    await expect(
      withdrawWeeklyReportSubmission("wr-1", { id: "student-1" }, beforeDeadline)
    ).rejects.toThrow(WeeklyReportWithdrawError);
    expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
  });
});
