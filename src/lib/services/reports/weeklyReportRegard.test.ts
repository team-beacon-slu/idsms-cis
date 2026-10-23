import { WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  computeTotalHoursRendered,
  computeProjectedCompletionDate,
} from "@/lib/services/attendance/attendanceService";
import { reviewWeeklyReport_Regard } from "@/lib/services/reports/weeklyReportService";

jest.mock("@/lib/services/attendance/attendanceService");
const total = jest.mocked(computeTotalHoursRendered);
const projection = jest.mocked(computeProjectedCompletionDate);
beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  // Regard needs a submitted report awaiting review.
  prismaMock.weeklyReport.findUniqueOrThrow.mockResolvedValue({
    status: WeeklyReportStatus.PENDING,
    revisionHistory: [{ type: "SUBMITTED", timestamp: "t0" }],
  } as never);
  // No later weeks whose running totals need refreshing.
  prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
});

it("records REGARDED, audits it, and refreshes hours for the report's owner", async () => {
  prismaMock.weeklyReport.update.mockResolvedValue({
    id: "wr-1",
    status: WeeklyReportStatus.REGARDED,
    studentProfileId: "profile-1",
  } as never);
  await expect(reviewWeeklyReport_Regard("wr-1", "faculty-1")).resolves.toEqual({
    id: "wr-1",
    status: WeeklyReportStatus.REGARDED,
  });
  expect(prismaMock.weeklyReport.update).toHaveBeenCalledWith({
    where: { id: "wr-1" },
    data: { status: WeeklyReportStatus.REGARDED, facultyAction: "REGARDED by faculty-1" },
    select: { id: true, status: true, studentProfileId: true, weekStart: true },
  });
  expect(total).toHaveBeenCalledWith("profile-1");
  // The projection is read-only, computed where it's shown; nothing to refresh here.
  expect(projection).not.toHaveBeenCalled();
  expect(prismaMock.weeklyReport.update.mock.invocationCallOrder[0]).toBeLessThan(
    total.mock.invocationCallOrder[0]
  );
  expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ action: "WEEKLY_REPORT_REGARDED" }) })
  );
});

it("propagates an update failure without changing hours or projections", async () => {
  prismaMock.weeklyReport.update.mockRejectedValue(new Error("Not found"));
  await expect(reviewWeeklyReport_Regard("missing", "faculty-1")).rejects.toThrow("Not found");
  expect(total).not.toHaveBeenCalled();
  expect(projection).not.toHaveBeenCalled();
});

it("propagates computation failure and does not fabricate a successful review response", async () => {
  prismaMock.weeklyReport.update.mockResolvedValue({
    id: "wr-1",
    status: WeeklyReportStatus.REGARDED,
    studentProfileId: "profile-1",
  } as never);
  total.mockRejectedValueOnce(new Error("Compute failed"));
  await expect(reviewWeeklyReport_Regard("wr-1", "faculty-1")).rejects.toThrow("Compute failed");
  expect(projection).not.toHaveBeenCalled();
});
