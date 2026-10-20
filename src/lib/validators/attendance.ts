import { z } from "zod";
import { DeviationType, Program } from "@prisma/client";
import { parseHHMM, timeOfDay } from "@/lib/utils/timeMath";

export const scheduleConfigSchema = z
  .object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Select at least one working day"),
    hoursPerDay: z.number().positive(),
    startTime: timeOfDay.optional(),
    endTime: timeOfDay.optional(),
    breakMinutes: z.number().int().min(0).max(240).optional(),
  })
  .refine((s) => !s.startTime === !s.endTime, {
    message: "Give both a start and an end time",
    path: ["endTime"],
  })
  .refine((s) => !s.startTime || !s.endTime || parseHHMM(s.endTime) > parseHHMM(s.startTime), {
    message: "End time must be after start time",
    path: ["endTime"],
  });

// The schedule route's multipart body. Shift keys are only set when sent so
// legacy schedules keep their { daysOfWeek, hoursPerDay } shape.
export function scheduleConfigFromFormData(formData: FormData) {
  const days = String(formData.get("daysOfWeek") ?? "");
  const startTime = formData.get("startTime");
  const endTime = formData.get("endTime");
  const breakMinutes = formData.get("breakMinutes");
  return {
    daysOfWeek: days ? days.split(",").map(Number) : [],
    hoursPerDay: Number(formData.get("hoursPerDay")),
    ...(startTime ? { startTime: String(startTime) } : {}),
    ...(endTime ? { endTime: String(endTime) } : {}),
    ...(breakMinutes != null && breakMinutes !== "" ? { breakMinutes: Number(breakMinutes) } : {}),
  };
}

export const scheduleChangeRequestSchema = z.object({
  reason: z.string().min(1, "A reason is required"),
  newScheduleConfig: scheduleConfigSchema,
  supportingDocumentPath: z.string().min(1).optional(),
});

export const scheduleChangeReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});

export const deviationReportSchema = z.object({
  date: z.coerce.date(),
  deviationType: z.enum(DeviationType),
  reason: z.string().min(1, "A reason is required"),
  proofUrl: z.string().min(1).optional(),
});

export const deviationValidateSchema = z.object({
  action: z.enum(["VALIDATE", "REJECT"]),
});

export const holidayApplicableSchema = z.object({
  holidayEntryId: z.uuid(),
  applicable: z.boolean(),
});

export const requiredHoursConfigSchema = z.object({
  program: z.enum(Program),
  hours: z.number().int().positive(),
});
