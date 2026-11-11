import { reportDays, reportPeriodEnd } from "@/lib/utils/reportWeek";

const monday = new Date("2026-11-09T00:00:00Z");
const day = (d: string) => ({ reportDate: `${d}T00:00:00.000Z` });

describe("a weekly report covers Monday to Friday", () => {
  it("lists all five weekdays even when the schedule is Mon–Thu, Friday as a day off", () => {
    const days = reportDays(
      monday,
      ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"].map(day)
    );
    expect(days.map((d) => d.key)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
    expect(days[4].entry).toBeNull();
    expect(reportPeriodEnd(monday, [])).toEqual(new Date("2026-11-13T00:00:00Z"));
  });

  it("adds Saturday or Sunday only when one was worked, and the period runs to it", () => {
    const entries = [day("2026-11-09"), day("2026-11-14")];
    expect(reportDays(monday, entries).map((d) => d.key)).toContain("2026-11-14");
    expect(reportDays(monday, entries).map((d) => d.key)).not.toContain("2026-11-15");
    expect(reportPeriodEnd(monday, entries)).toEqual(new Date("2026-11-14T00:00:00Z"));
    expect(reportPeriodEnd(monday, [day("2026-11-15")])).toEqual(new Date("2026-11-15T00:00:00Z"));
  });
});
