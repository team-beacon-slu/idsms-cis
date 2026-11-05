import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { loadTimeReportData, timeReportKindsFor } from "@/lib/documents/timeReportData";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const profile = {
  fullName: "Dela Cruz, Juan P.",
  user: { email: "juan@slu.edu.ph" },
  company: { name: "Acme", supervisorName: "Maria" },
  semester: { weekOneStart: d("2026-10-05") },
};
const week = { weekStart: d("2026-10-05"), weekEnd: d("2026-10-11") };
const request = (over: object) => ({
  date: d("2026-10-10"),
  endDate: null,
  startTime: null,
  endTime: null,
  requestedMinutes: null,
  reason: "Reason",
  requestKind: null,
  proofType: null,
  validationStatus: "VALIDATED",
  ...over,
});

beforeEach(() => {
  resetPrismaMock();
  prismaMock.studentProfile.findUnique.mockResolvedValue(profile as never);
  prismaMock.weeklyReport.findFirst.mockResolvedValue(week as never);
  prismaMock.deviationReport.findMany.mockResolvedValue([]);
  prismaMock.dailyReportEntry.findMany.mockResolvedValue([]);
});

it("loads one week's overtime, leaving rejected requests out", async () => {
  prismaMock.deviationReport.findMany.mockResolvedValue([
    request({
      startTime: "08:00",
      endTime: "12:00",
      requestedMinutes: 240,
      validationStatus: "PENDING",
    }),
  ] as never);
  const data = (await loadTimeReportData("p-1", "OT", "wr-1"))!;
  expect(data.week).toEqual({ number: 1, start: week.weekStart, end: week.weekEnd });
  expect(data.rows).toEqual([expect.objectContaining({ minutes: 240, pending: true })]);
  expect(prismaMock.deviationReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        deviationType: "OVERTIME",
        validationStatus: { not: "REJECTED" },
        date: { gte: week.weekStart, lte: week.weekEnd },
      }),
    })
  );
});

it("adds Absent days no leave covers, in date order", async () => {
  prismaMock.deviationReport.findMany.mockResolvedValue([
    request({
      date: d("2026-10-06"),
      endDate: d("2026-10-07"),
      requestKind: "EMERGENCY",
      proofType: "MEDICAL_CERTIFICATE",
    }),
  ] as never);
  prismaMock.dailyReportEntry.findMany.mockResolvedValue([
    { reportDate: d("2026-10-07") }, // covered by the leave
    { reportDate: d("2026-10-05") },
  ] as never);
  const data = (await loadTimeReportData("p-1", "ABSENCE"))!;
  expect(data.week).toBeNull();
  expect(data.absences.map((a) => [a.date.toISOString().slice(0, 10), a.kind])).toEqual([
    ["2026-10-05", null],
    ["2026-10-06", "EMERGENCY"],
  ]);
});

it("refuses a week that belongs to another student", async () => {
  prismaMock.weeklyReport.findFirst.mockResolvedValue(null);
  expect(await loadTimeReportData("p-1", "UT", "someone-elses")).toBeNull();
});

it("offers each week only the reports it has", () => {
  expect(
    timeReportKindsFor(week, {
      requests: [
        { deviationType: "OVERTIME", date: d("2026-10-10"), endDate: null },
        { deviationType: "ABSENCE", date: d("2026-10-02"), endDate: d("2026-10-05") },
        { deviationType: "UNDERTIME", date: d("2026-10-20"), endDate: null },
      ] as never,
      absentDates: [],
    })
  ).toEqual(["OT", "ABSENCE"]);
  expect(timeReportKindsFor(week, { requests: [], absentDates: ["2026-10-08"] })).toEqual([
    "ABSENCE",
  ]);
});
