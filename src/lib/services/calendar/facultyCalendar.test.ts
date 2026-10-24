import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getFacultyCalendarView } from "@/lib/services/calendar/calendarService";
import {
  computeProjectedCompletionDate,
  getHolidayCalendarForStudent,
} from "@/lib/services/attendance/attendanceService";
import { listWeeklyReportsForStudent } from "@/lib/services/reports/weeklyReportService";
jest.mock("@/lib/services/attendance/attendanceService");
jest.mock("@/lib/services/reports/weeklyReportService");
beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  jest.mocked(computeProjectedCompletionDate).mockResolvedValue(null);
  jest.mocked(getHolidayCalendarForStudent).mockResolvedValue([]);
  jest.mocked(listWeeklyReportsForStudent).mockResolvedValue([]);
  prismaMock.deviationReport.findMany.mockResolvedValue([]);
  prismaMock.weeklyReport.findMany.mockResolvedValue([]);
  prismaMock.holidayCalendarEntry.findMany.mockResolvedValue([]);
  prismaMock.workPlan.findMany.mockResolvedValue([]);
});
it("aggregates assigned students using both class group and semester, then colors and sorts", async () => {
  prismaMock.facultyClassGroup.findMany.mockResolvedValue([
    { classGroupId: "g-1", semesterId: "s-1" },
    { classGroupId: "g-2", semesterId: "s-2" },
  ] as never);
  prismaMock.studentProfile.findMany.mockResolvedValue([{ id: "p-1" }, { id: "p-2" }] as never);
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    { studentProfileId: "p-1", weekStart: new Date("2026-10-12"), weekEnd: new Date("2026-10-18") },
    { studentProfileId: "p-2", weekStart: new Date("2026-10-05"), weekEnd: new Date("2026-10-11") },
  ] as never);
  const events = await getFacultyCalendarView("faculty-1");
  expect(prismaMock.facultyClassGroup.findMany).toHaveBeenCalledWith({
    where: { facultyId: "faculty-1" },
    select: { classGroupId: true, semesterId: true },
  });
  expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith({
    where: {
      deletedAt: null,
      OR: [
        { classGroupId: "g-1", semesterId: "s-1" },
        { classGroupId: "g-2", semesterId: "s-2" },
      ],
    },
    select: { id: true },
  });
  expect(
    events.map((event) => [event.studentProfileId, event.color, event.date.toISOString()])
  ).toEqual([
    ["p-2", "red", "2026-10-13T00:00:00.000Z"],
    ["p-1", "red", "2026-10-20T00:00:00.000Z"],
  ]);
  // One query for every advisee, not one per advisee.
  expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledTimes(1);
  expect(listWeeklyReportsForStudent).not.toHaveBeenCalled();
});
it("propagates lookup failures instead of returning a misleading empty calendar", async () => {
  prismaMock.facultyClassGroup.findMany.mockRejectedValue(new Error("Unavailable"));
  await expect(getFacultyCalendarView("faculty-1")).rejects.toThrow("Unavailable");
  expect(listWeeklyReportsForStudent).not.toHaveBeenCalled();
});
