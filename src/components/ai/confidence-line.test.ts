import { confidenceLine } from "./ai-hints";

describe("confidenceLine", () => {
  it("says it is not measured until 5 ratings", () => {
    expect(confidenceLine(undefined)).toMatch(/not measured yet \(0 of 5/);
    expect(confidenceLine({ count: 4, notRight: 0 })).toMatch(/not measured yet \(4 of 5/);
  });

  it("gives the share rated Right", () => {
    expect(confidenceLine({ count: 40, notRight: 3 })).toBe(
      "Confidence: right 93% of the time (37 of 40 ratings by advisers)."
    );
  });
});
