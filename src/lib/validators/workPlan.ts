import { z } from "zod";
import { scheduleConfigSchema } from "@/lib/validators/attendance";

// One row of the work plan, as in SAMCIS's sample (Period, Area/Topic, Specific Tasks,
// Expected Output, No. of hours spent). Only the tasks are required: older plans were a
// plain task list, and AI assist reads `description` for plan coverage.
export const workPlanRowSchema = z.object({
  description: z.string().trim().min(1, "Write the specific tasks").max(2000), // one per line
  period: z.string().trim().max(100).optional(), // e.g. "June 10 – June 11, 2021"
  area: z.string().trim().max(150).optional(),
  output: z.string().trim().max(500).optional(),
  hours: z.number().min(0).max(1000).optional(),
});
export type WorkPlanRow = z.infer<typeof workPlanRowSchema>;

export const submitWorkPlanSchema = z.object({
  // May be empty when the company's own work plan is uploaded (the route checks one is there).
  plannedTasks: z.array(workPlanRowSchema).default([]),
  // The same shape as the attendance schedule: an approved plan's schedule drives the
  // projected-completion loop, so an impossible day or zero hours would never finish.
  scheduleConfig: scheduleConfigSchema.optional(),
});

export const reviewWorkPlanSchema = z.object({
  action: z.enum(["APPROVE", "RETURN"]),
  comments: z.string().min(1).optional(),
});

// A stored plan's rows, or [] when it isn't a row list.
export const asWorkPlanRows = (value: unknown): WorkPlanRow[] => {
  const parsed = z.array(workPlanRowSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
};
