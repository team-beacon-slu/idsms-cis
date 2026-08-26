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
  const dailyReportEntryId = "8d6e3e3a-6b3e-4e7a-9b3e-1a2b3c4d5e6f";

  it("accepts a valid entry", () => {
    const result = dailyEntrySchema.parse({
      dailyReportEntryId,
      hours: 8,
      accomplishments: "Fixed the login bug",
    });
    expect(result.hours).toBe(8);
    expect(result.dailyReportEntryId).toBe(dailyReportEntryId);
  });

  it("rejects hours above 24", () => {
    expect(() =>
      dailyEntrySchema.parse({ dailyReportEntryId, hours: 25, accomplishments: "x" })
    ).toThrow();
  });

  it("rejects empty accomplishments", () => {
    expect(() =>
      dailyEntrySchema.parse({ dailyReportEntryId, hours: 8, accomplishments: "" })
    ).toThrow();
  });

  it("rejects a missing dailyReportEntryId", () => {
    expect(() => dailyEntrySchema.parse({ hours: 8, accomplishments: "x" })).toThrow();
  });

  it("rejects a non-uuid dailyReportEntryId", () => {
    expect(() =>
      dailyEntrySchema.parse({ dailyReportEntryId: "not-a-uuid", hours: 8, accomplishments: "x" })
    ).toThrow();
  });
});

describe("weeklyReportSubmitSchema", () => {
  it("allows an absent reasonForDelay", () => {
    expect(weeklyReportSubmitSchema.parse({}).reasonForDelay).toBeUndefined();
  });
});

describe("weeklyReportReviewSchema", () => {
  it("accepts APPROVE, REGARD, and DISREGARD without notes", () => {
    for (const action of ["APPROVE", "REGARD", "DISREGARD"] as const) {
      expect(weeklyReportReviewSchema.parse({ action }).action).toBe(action);
    }
  });

  it("accepts RETURN with notes", () => {
    const result = weeklyReportReviewSchema.parse({ action: "RETURN", notes: "Missing Tuesday" });
    expect(result.action).toBe("RETURN");
  });

  it("rejects RETURN without notes", () => {
    expect(() => weeklyReportReviewSchema.parse({ action: "RETURN" })).toThrow();
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
