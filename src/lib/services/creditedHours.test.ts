import { DeviationType, ValidationStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { creditForEntry, loadCreditContext } from "@/lib/services/creditedHours";
import { scheduleShift } from "@/lib/utils/timeMath";

beforeEach(() => resetPrismaMock());

const shift = scheduleShift({
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: 60,
  hoursPerDay: 8,
});
const monday = new Date("2026-10-05T00:00:00Z");
const saturday = new Date("2026-10-10T00:00:00Z");

function entry(over: Record<string, unknown> = {}) {
  return {
    reportDate: monday,
    scheduledHours: 8,
    actualHours: 8,
    attendanceStatus: "PRESENT",
    timeIn: "07:35",
    timeOut: "12:10",
    timeIn2: "13:00",
    timeOut2: "17:05",
    ...over,
  };
}

describe("loadCreditContext", () => {
  it("reads the shift and the approved OT minutes per date", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: {
        daysOfWeek: [1],
        hoursPerDay: 8,
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 60,
      },
    } as never);
    prismaMock.deviationReport.findMany.mockResolvedValue([
      { date: saturday, requestedMinutes: 120 },
      { date: saturday, requestedMinutes: 120 },
    ] as never);

    const ctx = await loadCreditContext("profile-1");

    expect(ctx.shift).toEqual(shift);
    expect(ctx.otMinutesByDate.get("2026-10-10")).toBe(240);
    expect(prismaMock.deviationReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId: "profile-1",
          deviationType: DeviationType.OVERTIME,
          validationStatus: ValidationStatus.VALIDATED,
        },
      })
    );
  });

  it("has no shift for a legacy schedule", async () => {
    prismaMock.workPlan.findFirst.mockResolvedValue({
      scheduleConfig: { daysOfWeek: [1], hoursPerDay: 8 },
    } as never);
    prismaMock.deviationReport.findMany.mockResolvedValue([] as never);
    expect((await loadCreditContext("profile-1")).shift).toBeNull();
  });
});

describe("creditForEntry", () => {
  const ctx = { shift, otMinutesByDate: new Map<string, number>() };

  it("applies the SLU shift rules (worked example 1 → 8 h)", () => {
    expect(creditForEntry(entry({ actualHours: 9.08 }), ctx)).toBe(8);
  });

  it("never credits more than the hours the student entered", () => {
    expect(creditForEntry(entry({ actualHours: 6 }), ctx)).toBe(6);
  });

  it("credits a Saturday only with approved OT", () => {
    const sat = entry({
      reportDate: saturday,
      scheduledHours: 0,
      actualHours: 4,
      timeIn: "08:00",
      timeOut: "12:00",
      timeIn2: null,
      timeOut2: null,
    });
    expect(creditForEntry(sat, ctx)).toBe(0);
    expect(creditForEntry(sat, { shift, otMinutesByDate: new Map([["2026-10-10", 240]]) })).toBe(4);
  });

  it("is 0 for ABSENT/HOLIDAY and null for an unfilled day", () => {
    expect(creditForEntry(entry({ attendanceStatus: "HOLIDAY" }), ctx)).toBe(0);
    expect(
      creditForEntry(entry({ attendanceStatus: "SCHEDULED", actualHours: null }), ctx)
    ).toBeNull();
  });
});
