import {
  dailyEntrySchema,
  isAttendanceStatus,
  minutesBetween,
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

  it("rejects an out-of-range month number", () => {
    expect(() => monthlyReportSchema.parse({ calendarMonth: "2026-13" })).toThrow();
    expect(() => monthlyReportSchema.parse({ calendarMonth: "2026-00" })).toThrow();
  });
});

const base = { dailyReportEntryId: "8a213754-eeaf-4ddb-abf2-b78af4a2af61" };

describe("dailyEntrySchema attendance status and times", () => {
  it("defaults to PRESENT and requires accomplishments when present", () => {
    expect(dailyEntrySchema.safeParse({ ...base, hours: 8, accomplishments: "" }).success).toBe(
      false
    );
    const ok = dailyEntrySchema.parse({ ...base, hours: 8, accomplishments: "Built login" });
    expect(ok.attendanceStatus).toBe("PRESENT");
  });

  it("ABSENT and HOLIDAY need no accomplishments and must be 0 hours", () => {
    expect(
      dailyEntrySchema.safeParse({
        ...base,
        hours: 0,
        accomplishments: "",
        attendanceStatus: "ABSENT",
      }).success
    ).toBe(true);
    expect(
      dailyEntrySchema.safeParse({
        ...base,
        hours: 4,
        accomplishments: "",
        attendanceStatus: "HOLIDAY",
      }).success
    ).toBe(false);
  });

  it("rejects time out before time in", () => {
    const r = dailyEntrySchema.safeParse({
      ...base,
      hours: 8,
      accomplishments: "x",
      timeIn: "17:00",
      timeOut: "08:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects hours larger than the time window", () => {
    const r = dailyEntrySchema.safeParse({
      ...base,
      hours: 9,
      accomplishments: "x",
      timeIn: "08:00",
      timeOut: "16:00",
    });
    expect(r.success).toBe(false);
  });

  it("accepts hours within the window (lunch excluded by the student)", () => {
    const r = dailyEntrySchema.safeParse({
      ...base,
      hours: 8,
      accomplishments: "x",
      timeIn: "08:00",
      timeOut: "17:00",
    });
    expect(r.success).toBe(true);
  });

  it("rejects malformed times", () => {
    expect(
      dailyEntrySchema.safeParse({
        ...base,
        hours: 1,
        accomplishments: "x",
        timeIn: "8am",
        timeOut: "09:00",
      }).success
    ).toBe(false);
  });
});

describe("dailyEntrySchema second time range", () => {
  const present = { ...base, accomplishments: "x" };

  it("accepts a morning and an afternoon range", () => {
    const r = dailyEntrySchema.safeParse({
      ...present,
      hours: 8,
      timeIn: "08:00",
      timeOut: "12:00",
      timeIn2: "13:00",
      timeOut2: "17:00",
    });
    expect(r.success).toBe(true);
  });

  it("rejects overlapping ranges", () => {
    const r = dailyEntrySchema.safeParse({
      ...present,
      hours: 6,
      timeIn: "08:00",
      timeOut: "12:30",
      timeIn2: "12:00",
      timeOut2: "17:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects hours above the summed windows", () => {
    const r = dailyEntrySchema.safeParse({
      ...present,
      hours: 8.5,
      timeIn: "08:00",
      timeOut: "12:00",
      timeIn2: "13:00",
      timeOut2: "17:00",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a second range without the first", () => {
    const r = dailyEntrySchema.safeParse({
      ...present,
      hours: 4,
      timeIn2: "13:00",
      timeOut2: "17:00",
    });
    expect(r.success).toBe(false);
  });
});

describe("minutesBetween", () => {
  it("counts minutes between HH:MM times", () => {
    expect(minutesBetween("08:00", "17:30")).toBe(570);
  });
});

describe("isAttendanceStatus", () => {
  it("narrows only the three stored statuses", () => {
    expect(isAttendanceStatus("ABSENT")).toBe(true);
    expect(isAttendanceStatus("SCHEDULED")).toBe(false);
  });
});
