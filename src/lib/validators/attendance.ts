import { z } from "zod";
import { DeviationType, Program } from "@prisma/client";

export const scheduleConfigSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Select at least one working day"),
  hoursPerDay: z.number().positive(),
});

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

export const requiredHoursConfigSchema = z.object({
  program: z.enum(Program),
  hours: z.number().int().positive(),
});
