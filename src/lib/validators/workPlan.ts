import { z } from "zod";
import { scheduleConfigSchema } from "@/lib/validators/attendance";

export const submitWorkPlanSchema = z.object({
  plannedTasks: z
    .array(z.object({ description: z.string().min(1) }))
    .min(1, "At least one planned task is required"),
  // The same shape as the attendance schedule: an approved plan's schedule drives the
  // projected-completion loop, so an impossible day or zero hours would never finish.
  scheduleConfig: scheduleConfigSchema.optional(),
});

export const reviewWorkPlanSchema = z.object({
  action: z.enum(["APPROVE", "RETURN"]),
  comments: z.string().min(1).optional(),
});
