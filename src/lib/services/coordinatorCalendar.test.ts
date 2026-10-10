import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { getCoordinatorCalendarView } from "@/lib/services/calendarService";
import {
  computeProjectedCompletionDate,
  getHolidayCalendarForStudent,
} from "@/lib/services/attendanceService";
import { listWeeklyReportsForStudent } from "@/lib/services/weeklyReportService";
import { getExpiringMoaRecords } from "@/lib/services/companyService";
jest.mock("@/lib/services/attendanceService");
jest.mock("@/lib/services/weeklyReportService");
jest.mock("@/lib/services/companyService");
beforeEach(() => {
  resetPrismaMock();
  jest.clearAllMocks();
  prismaMock.studentProfile.findMany.mockResolvedValue([]);
  prismaMock.deviationReport.findMany.mockResolvedValue([]);
  jest.mocked(getHolidayCalendarForStudent).mockResolvedValue([]);
  jest.mocked(listWeeklyReportsForStudent).mockResolvedValue([]);
  jest.mocked(computeProjectedCompletionDate).mockResolvedValue(null);
  jest.mocked(getExpiringMoaRecords).mockResolvedValue([]);
});
it("merges all department milestones with Phase 2 MOA expirations, colored and sorted", async () => {
  prismaMock.studentProfile.findMany.mockResolvedValue([{ id: "p-1" }, { id: "p-2" }] as never);
  jest
    .mocked(computeProjectedCompletionDate)
    .mockImplementation(async (id) => new Date(id === "p-1" ? "2026-10-30" : "2026-10-20"));
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
    ["COMPLETION", "green", "Projected OJT Completion Date", "p-2"],
    ["DEADLINE", "red", "MOA expiry — Acme", undefined],
    ["COMPLETION", "green", "Projected OJT Completion Date", "p-1"],
  ]);
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
