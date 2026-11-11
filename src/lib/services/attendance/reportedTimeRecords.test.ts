import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  acceptReportedInWeek,
  adviserNoteOf,
  isReported,
  reportedRows,
  REPORTED_IN_WEEKLY,
  reviewNoteFor,
  syncReportedDay,
} from "@/lib/services/attendance/reportedTimeRecords";
import { scheduleShift } from "@/lib/utils/timeMath";

const shift = scheduleShift({
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: 60,
  hoursPerDay: 8,
});
const base = {
  studentProfileId: "sp-1",
  reportDate: new Date("2026-11-10T00:00:00Z"),
  scheduledHours: 8,
  shift,
};

describe("reportedRows", () => {
  it("records nothing without a reason", () => {
    expect(reportedRows({ ...base, status: "PRESENT", ranges: [["08:00", "19:00"]] })).toEqual([]);
  });

  it("turns a reported overtime into a pending overtime row capped at its minutes", () => {
    const [row] = reportedRows({
      ...base,
      status: "PRESENT",
      ranges: [["08:00", "19:00"]],
      note: { reason: "Deployment ran late" },
    });
    expect(row).toMatchObject({
      deviationType: "OVERTIME",
      startTime: "17:00",
      endTime: "19:00",
      requestedMinutes: 120,
      validationStatus: "PENDING", // the adviser decides
      reviewNote: REPORTED_IN_WEEKLY,
      reason: "Deployment ran late",
    });
  });

  it("records an early leave as undertime covering the gap", () => {
    const rows = reportedRows({
      ...base,
      status: "PRESENT",
      ranges: [["08:00", "15:00"]],
      note: { reason: "Dentist appointment" },
    });
    expect(rows.map((r) => [r.deviationType, r.startTime, r.endTime])).toEqual([
      ["UNDERTIME", "15:00", "17:00"],
    ]);
  });

  it("records an absence with its proof, emergency unless planned", () => {
    const [row] = reportedRows({
      ...base,
      status: "ABSENT",
      ranges: [],
      note: { reason: "Sick with a fever", proofType: "MEDICAL_CERTIFICATE" },
    });
    expect(row).toMatchObject({
      deviationType: "ABSENCE",
      proofType: "MEDICAL_CERTIFICATE",
      requestKind: "EMERGENCY",
    });
  });

  it("records nothing for a holiday", () => {
    expect(
      reportedRows({ ...base, status: "HOLIDAY", ranges: [], note: { reason: "Company outing" } })
    ).toEqual([]);
  });
});

describe("the adviser's decisions survive", () => {
  const tx = prismaMock as never;
  const day = {
    ...base,
    status: "PRESENT",
    ranges: [["08:00", "19:00"]] as Array<[string, string]>,
  };
  const saved = {
    id: "dev-1",
    deviationType: "OVERTIME",
    startTime: "17:00",
    endTime: "19:00",
    requestedMinutes: 120,
    reason: "Deployment ran late",
    proofType: null,
    requestKind: null,
  };
  beforeEach(() => resetPrismaMock());

  it("keeps an unchanged reason (and its decision) when the day is saved again", async () => {
    prismaMock.deviationReport.findMany.mockResolvedValue([saved] as never);
    await syncReportedDay(tx, { ...day, note: { reason: "Deployment ran late" } });
    expect(prismaMock.deviationReport.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.deviationReport.createMany).not.toHaveBeenCalled();
  });

  it("replaces a changed reason, which waits for the adviser again", async () => {
    prismaMock.deviationReport.findMany.mockResolvedValue([saved] as never);
    await syncReportedDay(tx, { ...day, note: { reason: "Client asked for a hotfix" } });
    expect(prismaMock.deviationReport.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["dev-1"] } },
    });
    expect(prismaMock.deviationReport.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          reason: "Client asked for a hotfix",
          validationStatus: "PENDING",
        }),
      ],
    });
  });

  it("approving the week accepts only reasons still waiting, and gives their overtime days", async () => {
    const date = new Date("2026-11-10T00:00:00Z");
    prismaMock.deviationReport.findMany.mockResolvedValue([{ date }] as never);
    const days = await acceptReportedInWeek(
      tx,
      "sp-1",
      new Date("2026-11-09T00:00:00Z"),
      new Date("2026-11-15T00:00:00Z"),
      "faculty-1"
    );
    expect(days).toEqual([date]);
    expect(prismaMock.deviationReport.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        studentProfileId: "sp-1",
        validationStatus: "PENDING",
        reviewNote: { startsWith: REPORTED_IN_WEEKLY },
      }),
      data: { validationStatus: "VALIDATED", facultyId: "faculty-1" },
    });
  });

  it("keeps the weekly-report mark under the adviser's note", () => {
    const note = reviewNoteFor(REPORTED_IN_WEEKLY, "No proof from the company");
    expect(isReported(note)).toBe(true);
    expect(adviserNoteOf(note)).toBe("No proof from the company");
    expect(reviewNoteFor(note, null)).toBe(REPORTED_IN_WEEKLY);
    expect(reviewNoteFor(null, "Fix the dates")).toBe("Fix the dates");
  });
});
