import { defaultDayTimes } from "./timeMath";

describe("defaultDayTimes", () => {
  it("splits a full day at lunch so the ranges add up to the scheduled hours", () => {
    expect(defaultDayTimes(8)).toEqual({
      timeIn: "08:00",
      timeOut: "12:00",
      timeIn2: "13:00",
      timeOut2: "17:00",
    });
    expect(defaultDayTimes(10)).toEqual({
      timeIn: "08:00",
      timeOut: "12:00",
      timeIn2: "13:00",
      timeOut2: "19:00",
    });
    expect(defaultDayTimes(7.5).timeOut2).toBe("16:30");
  });

  it("keeps a short day in the morning", () => {
    expect(defaultDayTimes(4)).toEqual({
      timeIn: "08:00",
      timeOut: "12:00",
      timeIn2: "",
      timeOut2: "",
    });
  });
});
