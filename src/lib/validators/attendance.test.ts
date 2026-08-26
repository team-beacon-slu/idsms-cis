import { DeviationType } from "@prisma/client";
import {
  deviationReportSchema,
  deviationValidateSchema,
  requiredHoursConfigSchema,
  scheduleChangeRequestSchema,
  scheduleChangeReviewSchema,
  scheduleConfigSchema,
} from "@/lib/validators/attendance";

describe("scheduleConfigSchema", () => {
  it("accepts a valid schedule", () => {
    const result = scheduleConfigSchema.parse({ daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 });
    expect(result.hoursPerDay).toBe(8);
  });

  it("rejects an empty daysOfWeek array", () => {
    expect(() => scheduleConfigSchema.parse({ daysOfWeek: [], hoursPerDay: 8 })).toThrow();
  });

  it("rejects a day outside 0-6", () => {
    expect(() => scheduleConfigSchema.parse({ daysOfWeek: [7], hoursPerDay: 8 })).toThrow();
  });
});

describe("scheduleChangeRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = scheduleChangeRequestSchema.parse({
      reason: "New shift assigned by supervisor",
      newScheduleConfig: { daysOfWeek: [1, 2, 3], hoursPerDay: 6 },
    });
    expect(result.reason).toBe("New shift assigned by supervisor");
  });

  it("rejects an empty reason", () => {
    expect(() =>
      scheduleChangeRequestSchema.parse({
        reason: "",
        newScheduleConfig: { daysOfWeek: [1], hoursPerDay: 6 },
      })
    ).toThrow();
  });
});

describe("scheduleChangeReviewSchema", () => {
  it("accepts APPROVE and REJECT", () => {
    expect(scheduleChangeReviewSchema.parse({ action: "APPROVE" }).action).toBe("APPROVE");
    expect(scheduleChangeReviewSchema.parse({ action: "REJECT" }).action).toBe("REJECT");
  });

  it("rejects an unknown action", () => {
    expect(() => scheduleChangeReviewSchema.parse({ action: "MAYBE" })).toThrow();
  });
});

describe("deviationReportSchema", () => {
  it("accepts a valid deviation", () => {
    const result = deviationReportSchema.parse({
      date: "2026-08-20",
      deviationType: DeviationType.ABSENCE,
      reason: "Sick",
    });
    expect(result.deviationType).toBe(DeviationType.ABSENCE);
  });

  it("rejects an empty reason", () => {
    expect(() =>
      deviationReportSchema.parse({
        date: "2026-08-20",
        deviationType: DeviationType.ABSENCE,
        reason: "",
      })
    ).toThrow();
  });
});

describe("deviationValidateSchema", () => {
  it("accepts VALIDATE and REJECT", () => {
    expect(deviationValidateSchema.parse({ action: "VALIDATE" }).action).toBe("VALIDATE");
  });
});

describe("requiredHoursConfigSchema", () => {
  it("accepts a positive integer hours value", () => {
    expect(requiredHoursConfigSchema.parse({ program: "BSIT", hours: 600 }).hours).toBe(600);
  });

  it("rejects zero or negative hours", () => {
    expect(() => requiredHoursConfigSchema.parse({ program: "BSIT", hours: 0 })).toThrow();
  });
});
