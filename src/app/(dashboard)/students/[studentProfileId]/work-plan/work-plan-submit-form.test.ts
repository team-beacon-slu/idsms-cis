import { nextPeriod } from "./work-plan-submit-form";

it("starts the next row's period a week after the last, same length", () => {
  expect(nextPeriod("June 10 – June 14, 2026")).toBe("June 17 – June 21, 2026");
  expect(nextPeriod("June 29 - July 3, 2026")).toBe("July 6 – July 10, 2026");
  expect(nextPeriod("Jun 10 – 14, 2026")).toBe("June 17 – June 21, 2026");
});

it("crosses the year, and leaves free text alone", () => {
  expect(nextPeriod("December 29 – January 2, 2027")).toBe("January 5 – January 9, 2027");
  expect(nextPeriod("December 22 – December 26, 2026")).toBe("December 29 – January 2, 2027");
  expect(nextPeriod("Week 3")).toBe("");
  expect(nextPeriod("")).toBe("");
});
