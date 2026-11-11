import { dailyHours, longSchedule, scheduleCells } from "@/lib/utils/schedule";

const weekdays = [1, 2, 3, 4, 5];

describe("the 8-hours-a-day limit", () => {
  it("leaves a normal 8-hour day alone", () => {
    const s = {
      daysOfWeek: weekdays,
      hoursPerDay: 8,
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 60,
    };
    expect(longSchedule(s)).toBeNull();
    expect(scheduleCells(s).filter((c) => c.tone === "flag")).toHaveLength(0);
  });

  it("flags a 4-day, 10-hour week and marks its work days", () => {
    const s = { daysOfWeek: [1, 2, 3, 4], hoursPerDay: 10 };
    expect(longSchedule(s)?.short).toBe("Schedule: 10 h/day (DOLE: max 8 h/day)");
    expect(longSchedule(s)?.long).toMatch(/^This schedule has 10 hours of work a day\./);
    expect(scheduleCells(s).filter((c) => c.tone === "flag")).toHaveLength(4);
  });

  it("catches a shift longer than the hours it claims", () => {
    const s = {
      daysOfWeek: weekdays,
      hoursPerDay: 8,
      startTime: "07:00",
      endTime: "19:00",
      breakMinutes: 60,
    };
    expect(dailyHours(s)).toBe(11);
    expect(longSchedule(s)).not.toBeNull();
  });

  it("reads a night shift across midnight", () => {
    const s = {
      daysOfWeek: weekdays,
      hoursPerDay: 8,
      startTime: "22:00",
      endTime: "07:00",
      breakMinutes: 60,
    };
    expect(dailyHours(s)).toBe(8);
    expect(longSchedule(s)).toBeNull();
  });

  it("flags a week with no rest day, but not a 6-day week", () => {
    expect(longSchedule({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6], hoursPerDay: 6 })?.long).toMatch(
      /no rest day/
    );
    expect(longSchedule({ daysOfWeek: [1, 2, 3, 4, 5, 6], hoursPerDay: 8 })).toBeNull();
  });
});
