import {
  dailyEntrySchema,
  monthlyReportSchema,
  weeklyReportGenerateSchema,
  weeklyReportReviewSchema,
  weeklyReportSubmitSchema,
} from "@/lib/validators/report";

describe("weeklyReportGenerateSchema", () => {
  it("coerces a date string", () => {
    const result = weeklyReportGenerateSchema.parse({ weekStart: "2026-08-24" });
    expect(result.weekStart).toBeInstanceOf(Date);
  });
});

describe("dailyEntrySchema", () => {
  it("accepts a valid entry", () => {
    const result = dailyEntrySchema.parse({ hours: 8, accomplishments: "Fixed the login bug" });
    expect(result.hours).toBe(8);
  });

  it("rejects hours above 24", () => {
    expect(() => dailyEntrySchema.parse({ hours: 25, accomplishments: "x" })).toThrow();
  });

  it("rejects empty accomplishments", () => {
    expect(() => dailyEntrySchema.parse({ hours: 8, accomplishments: "" })).toThrow();
  });
});

describe("weeklyReportSubmitSchema", () => {
  it("allows an absent reasonForDelay", () => {
    expect(weeklyReportSubmitSchema.parse({}).reasonForDelay).toBeUndefined();
  });
});

describe("weeklyReportReviewSchema", () => {
  it("accepts all four review actions", () => {
    for (const action of ["APPROVE", "RETURN", "REGARD", "DISREGARD"] as const) {
      expect(weeklyReportReviewSchema.parse({ action }).action).toBe(action);
    }
  });

  it("rejects an unknown action", () => {
    expect(() => weeklyReportReviewSchema.parse({ action: "MAYBE" })).toThrow();
  });
});

describe("monthlyReportSchema", () => {
  it("accepts a YYYY-MM string", () => {
    expect(monthlyReportSchema.parse({ calendarMonth: "2026-08" }).calendarMonth).toBe("2026-08");
  });

  it("rejects a malformed month string", () => {
    expect(() => monthlyReportSchema.parse({ calendarMonth: "August 2026" })).toThrow();
  });
});
