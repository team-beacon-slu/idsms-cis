import { WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  computeTotalHoursRendered,
  computeProjectedCompletionDate,
} from "@/lib/services/attendanceService";
import { reviewWeeklyReport_Regard } from "@/lib/services/weeklyReportService";

jest.mock("@/lib/services/attendanceService");
const total = jest.mocked(computeTotalHoursRendered);
const projection = jest.mocked(computeProjectedCompletionDate);
beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
});

it("records REGARDED and refreshes hours and completion for the report's owner", async () => {
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
    select: { id: true, status: true, studentProfileId: true },
  });
  expect(total).toHaveBeenCalledWith("profile-1");
  expect(projection).toHaveBeenCalledWith("profile-1");
  expect(prismaMock.weeklyReport.update.mock.invocationCallOrder[0]).toBeLessThan(
    total.mock.invocationCallOrder[0]
  );
  expect(total.mock.invocationCallOrder[0]).toBeLessThan(projection.mock.invocationCallOrder[0]);
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
