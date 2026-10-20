// Faculty review actions only apply to a report the student has submitted
// and that is still awaiting review (bug: drafts and finalized reports could
// be approved, returned, regarded or disregarded).
import { WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  reviewWeeklyReport_Approve,
  reviewWeeklyReport_Disregard,
  reviewWeeklyReport_Regard,
  reviewWeeklyReport_Return,
  WeeklyReportNotAwaitingReviewError,
} from "@/lib/services/weeklyReportService";

jest.mock("@/lib/services/attendanceService", () => ({
  ...jest.requireActual("@/lib/services/attendanceService"),
  computeTotalHoursRendered: jest.fn(),
  computeProjectedCompletionDate: jest.fn(),
}));

beforeEach(() => resetPrismaMock());

const submitted = [{ type: "SUBMITTED", timestamp: "t0" }];
const actions = {
  approve: () => reviewWeeklyReport_Approve("wr-1", "faculty-1"),
  return: () => reviewWeeklyReport_Return("wr-1", "faculty-1", "Add details"),
  regard: () => reviewWeeklyReport_Regard("wr-1", "faculty-1"),
  disregard: () => reviewWeeklyReport_Disregard("wr-1", "faculty-1"),
};

describe.each(Object.entries(actions))("%s", (_name, run) => {
  it.each([
    ["a draft", WeeklyReportStatus.PENDING, []],
    [
      "a returned report",
      WeeklyReportStatus.RETURNED,
      [...submitted, { type: "RETURNED", timestamp: "t1" }],
    ],
    ["an approved report", WeeklyReportStatus.APPROVED, submitted],
  ])("refuses %s without writing", async (_label, status, revisionHistory) => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status,
      revisionHistory,
    } as never);
    await expect(run()).rejects.toThrow(WeeklyReportNotAwaitingReviewError);
    expect(prismaMock.weeklyReport.update).not.toHaveBeenCalled();
    expect(prismaMock.weeklyReport.delete).not.toHaveBeenCalled();
  });

  it("acts on a submitted report awaiting review", async () => {
    prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
      status: WeeklyReportStatus.PENDING,
      revisionHistory: submitted,
    } as never);
    prismaMock.weeklyReport.update.mockResolvedValue({
      id: "wr-1",
      status: WeeklyReportStatus.APPROVED,
      studentProfileId: "p-1",
    } as never);
    await expect(run()).resolves.toEqual(expect.objectContaining({ id: "wr-1" }));
  });
});
