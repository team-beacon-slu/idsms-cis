import {
  getWeekStartMonday,
  getWeeklyReportDueDate,
  getWeeklyReportDueInstant,
  isWeeklyReportLate,
} from "@/lib/utils/reportDeadline";

describe("reportDeadline", () => {
  const weekEnd = new Date("2026-10-11T00:00:00Z"); // Sunday

  it("is due the Tuesday after the week ends", () => {
    expect(getWeeklyReportDueDate(weekEnd)).toEqual(new Date("2026-10-13T00:00:00Z"));
  });

  it("stays on time until 23:59:59.999 Manila on that Tuesday", () => {
    expect(getWeeklyReportDueInstant(weekEnd)).toEqual(new Date("2026-10-13T15:59:59.999Z"));
    expect(isWeeklyReportLate(weekEnd, new Date("2026-10-13T15:59:59.999Z"))).toBe(false);
    expect(isWeeklyReportLate(weekEnd, new Date("2026-10-13T16:00:00Z"))).toBe(true);
  });

  it("snaps any day to the Monday of its week", () => {
    expect(getWeekStartMonday(new Date("2026-10-08T00:00:00Z"))).toEqual(
      new Date("2026-10-05T00:00:00Z")
    );
    expect(getWeekStartMonday(new Date("2026-10-11T00:00:00Z"))).toEqual(
      new Date("2026-10-05T00:00:00Z")
    );
  });

  it("uses the Manila calendar day — early Monday in Manila is still Sunday in UTC", () => {
    // 2026-10-12 01:00 Manila (Monday) = 2026-10-11 17:00 UTC (Sunday)
    expect(getWeekStartMonday(new Date("2026-10-11T17:00:00Z"))).toEqual(
      new Date("2026-10-12T00:00:00Z")
    );
  });
});
