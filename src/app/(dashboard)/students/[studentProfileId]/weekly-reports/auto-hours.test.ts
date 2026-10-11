import { autoHoursFromTimes } from "./auto-hours";

describe("autoHoursFromTimes", () => {
  it("subtracts a 1-hour lunch for spans over 5 hours", () => {
    expect(autoHoursFromTimes("08:00", "17:00")).toBe(8);
  });

  it("keeps a 5-hour span whole (no lunch)", () => {
    expect(autoHoursFromTimes("08:00", "13:00")).toBe(5);
  });

  it("never fills more hours than the time window allows", () => {
    // 250 minutes — nearest-quarter rounding would give 4.25 h (255 min).
    const hours = autoHoursFromTimes("08:00", "12:10")!;
    expect(hours * 60).toBeLessThanOrEqual(250);
    expect(hours).toBe(4);
  });

  it("returns null when a time is missing or out is not after in", () => {
    expect(autoHoursFromTimes("", "17:00")).toBeNull();
    expect(autoHoursFromTimes("17:00", "08:00")).toBeNull();
    expect(autoHoursFromTimes("08:00", "08:00")).toBeNull();
  });
});
