import { formatShift, parseScheduleConfig } from "./schedule";

describe("parseScheduleConfig", () => {
  it("keeps the shift fields", () => {
    expect(
      parseScheduleConfig({
        daysOfWeek: [1],
        hoursPerDay: 8,
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 60,
      })
    ).toEqual({
      daysOfWeek: [1],
      hoursPerDay: 8,
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 60,
    });
  });

  it("still reads a legacy config without them", () => {
    expect(parseScheduleConfig({ daysOfWeek: [1], hoursPerDay: 8 })).toEqual({
      daysOfWeek: [1],
      hoursPerDay: 8,
    });
  });
});

describe("formatShift", () => {
  it("reads like 8:00 am – 5:00 pm (1 h break)", () => {
    expect(formatShift({ startTime: "08:00", endTime: "17:00", breakMinutes: 60 })).toBe(
      "8:00 am – 5:00 pm (1 h break)"
    );
  });

  it("shows minutes and no break", () => {
    expect(formatShift({ startTime: "12:30", endTime: "16:30", breakMinutes: 0 })).toBe(
      "12:30 pm – 4:30 pm"
    );
    expect(formatShift({ startTime: "07:00", endTime: "16:00", breakMinutes: 30 })).toBe(
      "7:00 am – 4:00 pm (30 min break)"
    );
  });

  it("is null without times", () => {
    expect(formatShift({})).toBeNull();
  });
});
