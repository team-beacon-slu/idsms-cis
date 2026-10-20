import { requestedMinutes, timeRequestReviewSchema, timeRequestSchema } from "./timeRequest";

const reason = "Company asked me to finish the release";

describe("timeRequestSchema", () => {
  it("accepts an overtime request with times", () => {
    const r = timeRequestSchema.parse({
      deviationType: "OVERTIME",
      requestKind: "ANTICIPATED",
      date: "2026-10-10",
      startTime: "08:00",
      endTime: "12:00",
      reason,
    });
    expect(r.date).toEqual(new Date("2026-10-10T00:00:00Z"));
    expect(requestedMinutes(r)).toBe(240);
  });

  it.each(["OVERTIME", "UNDERTIME"])("%s needs a time range", (deviationType) => {
    expect(
      timeRequestSchema.safeParse({
        deviationType,
        requestKind: "EMERGENCY",
        date: "2026-10-10",
        reason,
      }).success
    ).toBe(false);
  });

  it("rejects an end time before the start time", () => {
    expect(
      timeRequestSchema.safeParse({
        deviationType: "UNDERTIME",
        requestKind: "EMERGENCY",
        date: "2026-10-10",
        startTime: "15:00",
        endTime: "14:00",
        reason,
      }).success
    ).toBe(false);
  });

  it("an absence needs a proof type", () => {
    const base = {
      deviationType: "ABSENCE",
      requestKind: "ANTICIPATED",
      date: "2026-10-12",
      reason,
    };
    expect(timeRequestSchema.safeParse(base).success).toBe(false);
    expect(timeRequestSchema.safeParse({ ...base, proofType: "PROOF_OF_LEAVE" }).success).toBe(
      true
    );
  });

  it("an absence may span up to 14 days, ending on or after its start", () => {
    const base = {
      deviationType: "ABSENCE",
      requestKind: "ANTICIPATED",
      date: "2026-10-12",
      reason,
      proofType: "MEDICAL_CERTIFICATE",
    };
    expect(timeRequestSchema.safeParse({ ...base, endDate: "2026-10-25" }).success).toBe(true);
    expect(timeRequestSchema.safeParse({ ...base, endDate: "2026-10-26" }).success).toBe(false);
    expect(timeRequestSchema.safeParse({ ...base, endDate: "2026-10-11" }).success).toBe(false);
  });

  it("a partial-day absence has times and no end date", () => {
    const base = {
      deviationType: "ABSENCE",
      requestKind: "ANTICIPATED",
      date: "2026-10-12",
      reason,
      proofType: "WRITTEN_NOTICE",
      startTime: "13:00",
      endTime: "17:00",
    };
    expect(timeRequestSchema.safeParse(base).success).toBe(true);
    expect(timeRequestSchema.safeParse({ ...base, endDate: "2026-10-13" }).success).toBe(false);
  });

  it("only absences take an end date", () => {
    expect(
      timeRequestSchema.safeParse({
        deviationType: "OVERTIME",
        requestKind: "ANTICIPATED",
        date: "2026-10-10",
        endDate: "2026-10-11",
        startTime: "08:00",
        endTime: "12:00",
        reason,
      }).success
    ).toBe(false);
  });

  it("trims the reason and requires 10–500 characters", () => {
    const base = {
      deviationType: "UNDERTIME",
      requestKind: "EMERGENCY",
      date: "2026-10-10",
      startTime: "08:00",
      endTime: "09:00",
    };
    expect(timeRequestSchema.safeParse({ ...base, reason: "   too short   " }).success).toBe(false);
    expect(timeRequestSchema.safeParse({ ...base, reason: "x".repeat(501) }).success).toBe(false);
    expect(timeRequestSchema.parse({ ...base, reason: `  ${reason}  ` }).reason).toBe(reason);
  });
});

describe("timeRequestReviewSchema", () => {
  it("requires a note to return", () => {
    expect(timeRequestReviewSchema.safeParse({ action: "RETURN" }).success).toBe(false);
    expect(timeRequestReviewSchema.safeParse({ action: "RETURN", note: "   " }).success).toBe(
      false
    );
    expect(
      timeRequestReviewSchema.safeParse({ action: "RETURN", note: "Attach the memo" }).success
    ).toBe(true);
    expect(timeRequestReviewSchema.safeParse({ action: "APPROVE" }).success).toBe(true);
  });
});
