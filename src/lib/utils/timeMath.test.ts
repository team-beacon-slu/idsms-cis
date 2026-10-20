import {
  computeDayCredit,
  dayGaps,
  formatHrsMins,
  overlapMinutes,
  parseHHMM,
  scheduleShift,
  type DayCreditInput,
} from "./timeMath";

const shift = scheduleShift({
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: 60,
  hoursPerDay: 8,
});

function day(over: Partial<DayCreditInput>): DayCreditInput {
  return {
    ranges: [],
    shift,
    scheduledDay: true,
    scheduledHours: 8,
    actualHours: null,
    approvedOtMinutes: 0,
    ...over,
  };
}

describe("parseHHMM", () => {
  it("returns minutes since midnight", () => {
    expect(parseHHMM("07:35")).toBe(455);
    expect(parseHHMM("00:00")).toBe(0);
  });
  it("throws on bad input", () => {
    expect(() => parseHHMM("7:35")).toThrow();
    expect(() => parseHHMM("24:00")).toThrow();
  });
});

describe("formatHrsMins", () => {
  it.each([
    [7.5, "7 hrs 30 mins"],
    [8, "8 hrs"],
    [0.5, "30 mins"],
    [0, "0 hrs"],
  ])("%p → %p", (hours, text) => {
    expect(formatHrsMins(hours)).toBe(text);
  });
});

describe("overlapMinutes", () => {
  it("measures the shared part of two ranges", () => {
    expect(overlapMinutes([455, 730], [480, 1020])).toBe(250);
    expect(overlapMinutes([0, 100], [200, 300])).toBe(0);
  });
});

describe("scheduleShift", () => {
  it("is null without start and end", () => {
    expect(scheduleShift({ hoursPerDay: 8 })).toBeNull();
  });
  it("defaults break to 0", () => {
    expect(scheduleShift({ startTime: "08:00", endTime: "12:00", hoursPerDay: 4 })).toEqual({
      startMin: 480,
      endMin: 720,
      breakMinutes: 0,
      scheduledHours: 4,
    });
  });
});

describe("computeDayCredit — SLU worked examples", () => {
  it("07:35–12:10 + 13:00–17:05 gives 8 h", () => {
    const c = computeDayCredit(
      day({
        ranges: [
          ["07:35", "12:10"],
          ["13:00", "17:05"],
        ],
      })
    );
    expect(c.creditedHours).toBe(8);
    expect(c.tardy).toBe(false);
    expect(c.earlyLeave).toBe(false);
  });

  it("08:30–12:00 + 13:00–17:00 gives 7.5 h and is tardy", () => {
    const c = computeDayCredit(
      day({
        ranges: [
          ["08:30", "12:00"],
          ["13:00", "17:00"],
        ],
      })
    );
    expect(c.creditedHours).toBe(7.5);
    expect(c.tardy).toBe(true);
  });

  it("07:55–17:15 as one range gives 8 h", () => {
    const c = computeDayCredit(day({ ranges: [["07:55", "17:15"]] }));
    expect(c.creditedHours).toBe(8);
    expect(c.workedHours).toBeCloseTo(9 + 20 / 60);
  });

  it("Saturday 08:00–12:00 with an approved 240-minute OT gives 4 h", () => {
    const c = computeDayCredit(
      day({
        ranges: [["08:00", "12:00"]],
        scheduledDay: false,
        scheduledHours: 0,
        approvedOtMinutes: 240,
      })
    );
    expect(c.baseHours).toBe(0);
    expect(c.creditedHours).toBe(4);
  });

  it("a non-scheduled day without OT gives 0", () => {
    const c = computeDayCredit(
      day({ ranges: [["08:00", "12:00"]], scheduledDay: false, scheduledHours: 0 })
    );
    expect(c.creditedHours).toBe(0);
  });

  it("a 20-minute OT is not credited even when approved", () => {
    const c = computeDayCredit(day({ ranges: [["08:00", "17:20"]], approvedOtMinutes: 20 }));
    expect(c.extraMinutes).toBe(20);
    expect(c.creditedOtHours).toBe(0);
    expect(c.creditedHours).toBe(8);
  });

  it("caps the credited OT at the approved minutes", () => {
    const c = computeDayCredit(day({ ranges: [["08:00", "19:00"]], approvedOtMinutes: 60 }));
    expect(c.extraMinutes).toBe(120);
    expect(c.creditedOtHours).toBe(1);
    expect(c.creditedHours).toBe(9);
  });

  it("a tardy day gets no OT even when approved (no offsetting)", () => {
    const c = computeDayCredit(day({ ranges: [["08:30", "18:30"]], approvedOtMinutes: 90 }));
    expect(c.tardy).toBe(true);
    expect(c.creditedOtHours).toBe(0);
  });

  it("flags early leave when the last time-out is before the shift end", () => {
    const c = computeDayCredit(
      day({
        ranges: [
          ["08:00", "12:00"],
          ["13:00", "16:00"],
        ],
      })
    );
    expect(c.earlyLeave).toBe(true);
    expect(c.creditedHours).toBe(7);
  });

  it("an afternoon-only day 13:00–17:00 gives 4 h", () => {
    const c = computeDayCredit(day({ ranges: [["13:00", "17:00"]] }));
    expect(c.creditedHours).toBe(4);
    expect(c.tardy).toBe(true);
  });
});

describe("dayGaps", () => {
  it("reports late arrival and early leave against the shift", () => {
    expect(
      dayGaps(
        [
          ["08:30", "12:00"],
          ["13:00", "16:00"],
        ],
        shift
      )
    ).toEqual([
      { kind: "late", start: "08:00", end: "08:30" },
      { kind: "early", start: "16:00", end: "17:00" },
    ]);
  });

  it("is empty for an on-time day, no ranges, or no shift (no grace period otherwise)", () => {
    expect(dayGaps([["08:00", "17:00"]], shift)).toEqual([]);
    expect(dayGaps([], shift)).toEqual([]);
    expect(dayGaps([["09:00", "17:00"]], null)).toEqual([]);
    expect(dayGaps([["08:01", "17:00"]], shift)).toEqual([
      { kind: "late", start: "08:00", end: "08:01" },
    ]);
  });
});

describe("computeDayCredit — legacy fallback", () => {
  it("uses min(actual, scheduled) when the schedule has no shift", () => {
    const c = computeDayCredit(day({ shift: null, actualHours: 9 }));
    expect(c.creditedHours).toBe(8);
    expect(c.tardy).toBe(false);
  });

  it("uses actualHours when there are no ranges", () => {
    const c = computeDayCredit(day({ ranges: [], actualHours: 6 }));
    expect(c.creditedHours).toBe(6);
  });

  it("credits eligible OT on top of the legacy cap", () => {
    const c = computeDayCredit(day({ shift: null, actualHours: 10, approvedOtMinutes: 90 }));
    expect(c.creditedHours).toBe(9.5);
  });

  it("treats a missing actualHours as 0, never NaN", () => {
    const c = computeDayCredit(day({ shift: null, actualHours: null }));
    expect(c.creditedHours).toBe(0);
  });
});
