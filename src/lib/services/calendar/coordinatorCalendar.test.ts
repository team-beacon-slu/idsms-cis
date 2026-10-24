import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getCoordinatorCalendarView } from "@/lib/services/calendar/calendarService";
import {
  computeProjectedCompletionDate,
  getHolidayCalendarForStudent,
} from "@/lib/services/attendance/attendanceService";
import { listWeeklyReportsForStudent } from "@/lib/services/reports/weeklyReportService";
import { getExpiringMoaRecords } from "@/lib/services/predeployment/companyService";
jest.mock("@/lib/services/attendance/attendanceService");
jest.mock("@/lib/services/reports/weeklyReportService");
jest.mock("@/lib/services/predeployment/companyService");
beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  prismaMock.studentProfile.findMany.mockResolvedValue([]);
  prismaMock.deviationReport.findMany.mockResolvedValue([]);
  jest.mocked(getHolidayCalendarForStudent).mockResolvedValue([]);
  jest.mocked(listWeeklyReportsForStudent).mockResolvedValue([]);
  jest.mocked(computeProjectedCompletionDate).mockResolvedValue(null);
  jest.mocked(getExpiringMoaRecords).mockResolvedValue([]);
  prismaMock.weeklyReport.findMany.mockResolvedValue([]);
  prismaMock.holidayCalendarEntry.findMany.mockResolvedValue([]);
  prismaMock.workPlan.findMany.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());
it("merges all department milestones with Phase 2 MOA expirations, colored and sorted", async () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-10-15T00:00:00Z"));
  // Projections come from stored rendered hours: 120 h left at 8 h/day ends Oct 30, 40 h left Oct 20.
  prismaMock.studentProfile.findMany.mockResolvedValue([
    { id: "p-1", semesterId: "s-1", requiredHours: 486, renderedHours: 366 },
    { id: "p-2", semesterId: "s-1", requiredHours: 486, renderedHours: 446 },
  ] as never);
  const everyDay = { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], hoursPerDay: 8 };
  prismaMock.workPlan.findMany.mockResolvedValue([
    { studentProfileId: "p-1", scheduleConfig: everyDay },
    { studentProfileId: "p-2", scheduleConfig: everyDay },
  ] as never);
  // Both interns share the week's report deadline; the coordinator sees it once.
  prismaMock.weeklyReport.findMany.mockResolvedValue([
    { studentProfileId: "p-1", weekStart: new Date("2026-10-05"), weekEnd: new Date("2026-10-11") },
    { studentProfileId: "p-2", weekStart: new Date("2026-10-05"), weekEnd: new Date("2026-10-11") },
  ] as never);
  jest
    .mocked(getExpiringMoaRecords)
    .mockResolvedValue([{ companyId: "company-1", validTo: new Date("2026-10-25") }] as never);
  prismaMock.company.findMany.mockResolvedValue([{ id: "company-1", name: "Acme" }] as never);
  const events = await getCoordinatorCalendarView("coordinator-1");
  expect(prismaMock.studentProfile.findMany).toHaveBeenCalledWith({
    where: { deletedAt: null },
    select: { id: true },
  });
  expect(getExpiringMoaRecords).toHaveBeenCalledWith();
  expect(
    events.map(({ type, color, label, studentProfileId }) => [type, color, label, studentProfileId])
  ).toEqual([
    ["DEADLINE", "red", "Weekly report due — week of 2026-10-05", undefined],
    ["COMPLETION", "green", "Projected OJT Completion Date", "p-2"],
    ["DEADLINE", "red", "MOA expiry — Acme", undefined],
    ["COMPLETION", "green", "Projected OJT Completion Date", "p-1"],
  ]);
  expect(computeProjectedCompletionDate).not.toHaveBeenCalled();
  expect(prismaMock.company.findMany).toHaveBeenCalledWith({
    where: { id: { in: ["company-1"] }, deletedAt: null },
    select: { id: true, name: true },
  });
});
it("returns empty without querying companies when neither students nor MOAs exist", async () => {
  expect(await getCoordinatorCalendarView("coordinator-1")).toEqual([]);
  expect(prismaMock.company.findMany).not.toHaveBeenCalled();
});
it("does not expose expiration events belonging to deleted companies", async () => {
  jest
    .mocked(getExpiringMoaRecords)
    .mockResolvedValue([{ companyId: "deleted-company", validTo: new Date() }] as never);
  prismaMock.company.findMany.mockResolvedValue([]);
  expect(await getCoordinatorCalendarView("coordinator-1")).toEqual([]);
});
it("propagates MOA lookup errors", async () => {
  jest.mocked(getExpiringMoaRecords).mockRejectedValue(new Error("Unavailable"));
  await expect(getCoordinatorCalendarView("coordinator-1")).rejects.toThrow("Unavailable");
});
