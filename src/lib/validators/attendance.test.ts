import {
  requiredHoursConfigSchema,
  scheduleChangeRequestSchema,
  scheduleChangeReviewSchema,
  scheduleConfigFromFormData,
  scheduleConfigSchema,
} from "@/lib/validators/attendance";

describe("scheduleConfigSchema shift times", () => {
  const base = { daysOfWeek: [1, 2, 3, 4, 5], hoursPerDay: 8 };

  it("accepts start, end and break", () => {
    const r = scheduleConfigSchema.parse({
      ...base,
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 60,
    });
    expect(r).toMatchObject({ startTime: "08:00", endTime: "17:00", breakMinutes: 60 });
  });

  it("rejects an end time that is not after the start time", () => {
    expect(() =>
      scheduleConfigSchema.parse({ ...base, startTime: "17:00", endTime: "08:00" })
    ).toThrow();
  });

  it("rejects only one of start and end", () => {
    expect(() => scheduleConfigSchema.parse({ ...base, startTime: "08:00" })).toThrow();
  });

  it("rejects a break outside 0–240 minutes", () => {
    expect(() =>
      scheduleConfigSchema.parse({
        ...base,
        startTime: "08:00",
        endTime: "17:00",
        breakMinutes: 241,
      })
    ).toThrow();
  });

  it("carries the shift fields through a change request", () => {
    const r = scheduleChangeRequestSchema.parse({
      reason: "New shift",
      newScheduleConfig: { ...base, startTime: "09:00", endTime: "18:00", breakMinutes: 60 },
    });
    expect(r.newScheduleConfig.startTime).toBe("09:00");
  });
});

describe("scheduleConfigFromFormData", () => {
  it("passes the shift keys through", () => {
    const fd = new FormData();
    fd.set("daysOfWeek", "1,2");
    fd.set("hoursPerDay", "8");
    fd.set("startTime", "08:00");
    fd.set("endTime", "17:00");
    fd.set("breakMinutes", "60");
    expect(scheduleConfigFromFormData(fd)).toEqual({
      daysOfWeek: [1, 2],
      hoursPerDay: 8,
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: 60,
    });
  });

  it("omits shift keys that were not sent", () => {
    const fd = new FormData();
    fd.set("daysOfWeek", "1");
    fd.set("hoursPerDay", "4");
    expect(scheduleConfigFromFormData(fd)).toEqual({ daysOfWeek: [1], hoursPerDay: 4 });
  });
});

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

describe("requiredHoursConfigSchema", () => {
  it("accepts a positive integer hours value", () => {
    expect(requiredHoursConfigSchema.parse({ program: "BSIT", hours: 600 }).hours).toBe(600);
  });

  it("rejects zero or negative hours", () => {
    expect(() => requiredHoursConfigSchema.parse({ program: "BSIT", hours: 0 })).toThrow();
  });
});
