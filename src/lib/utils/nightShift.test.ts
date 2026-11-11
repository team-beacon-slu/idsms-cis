import {
  computeDayCredit,
  dayExceptions,
  dayGaps,
  dayTimeline,
  scheduleShift,
  spanMinutes,
  toHHMM,
} from "@/lib/utils/timeMath";

// A US-hours intern in Manila: 22:00 to 06:00 the next morning, 1 h break, 7 h credited.
const night = scheduleShift({
  startTime: "22:00",
  endTime: "06:00",
  breakMinutes: 60,
  hoursPerDay: 7,
})!;
const day = scheduleShift({
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: 60,
  hoursPerDay: 8,
})!;

describe("night shifts", () => {
  it("ends the shift the next morning and prints times past midnight as clock times", () => {
    expect(night.endMin).toBe(30 * 60);
    expect(toHHMM(night.endMin)).toBe("06:00");
    expect(spanMinutes("22:00", "06:00")).toBe(480);
  });

  it("puts an after-midnight arrival after the start, so it reads as late, not early", () => {
    expect(dayTimeline([["00:30", "06:00"]], night)).toEqual([[1470, 1800]]);
    expect(dayGaps([["00:30", "06:00"]], night)).toEqual([
      { kind: "late", start: "22:00", end: "00:30" },
    ]);
  });

  it("credits a full night shift like a day shift", () => {
    const credit = computeDayCredit({
      ranges: [["22:00", "06:00"]],
      shift: night,
      scheduledDay: true,
      scheduledHours: 7,
      actualHours: null,
      approvedOtMinutes: 0,
    });
    expect(credit.creditedHours).toBe(7);
    expect(credit.tardy).toBe(false);
    expect(credit.earlyLeave).toBe(false);
  });

  it("keeps a midnight-to-6 shift on its own calendar day", () => {
    const early = scheduleShift({ startTime: "00:00", endTime: "06:00", hoursPerDay: 6 })!;
    expect(dayGaps([["00:00", "06:00"]], early)).toEqual([]);
  });
});

describe("dayExceptions", () => {
  it("finds overtime after the shift with its exact range", () => {
    expect(dayExceptions([["08:00", "19:00"]], day, true, 8)).toEqual([
      { kind: "overtime", start: "17:00", end: "19:00", minutes: 120 },
    ]);
  });

  it("finds a late arrival and an early leave", () => {
    expect(dayExceptions([["08:30", "16:00"]], day, true, 8)).toEqual([
      { kind: "late", start: "08:00", end: "08:30", minutes: 30 },
      { kind: "early", start: "16:00", end: "17:00", minutes: 60 },
    ]);
  });

  it("counts a worked day off as overtime in full", () => {
    expect(dayExceptions([["09:00", "12:00"]], day, false, 0)).toEqual([
      { kind: "overtime", start: "09:00", end: "12:00", minutes: 180 },
    ]);
  });

  it("finds night-shift overtime past 06:00 and nothing on a normal night", () => {
    expect(dayExceptions([["22:00", "06:00"]], night, true, 7)).toEqual([]);
    expect(dayExceptions([["22:00", "07:00"]], night, true, 7)).toEqual([
      { kind: "overtime", start: "06:00", end: "07:00", minutes: 60 },
    ]);
  });

  it("without shift times, compares the hours worked with the hours scheduled", () => {
    expect(dayExceptions([["08:00", "18:00"]], null, true, 8)).toEqual([
      { kind: "overtime", start: null, end: null, minutes: 120 },
    ]);
    expect(dayExceptions([["08:00", "14:00"]], null, true, 8)).toEqual([
      { kind: "early", start: null, end: null, minutes: 120 },
    ]);
    expect(dayExceptions([["08:00", "16:00"]], null, true, 8)).toEqual([]);
  });
});
