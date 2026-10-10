import { z } from "zod";

// scheduleConfig's real shape belongs to Phase 3 (FR-AT-01's daily-hours/
// working-days configuration) — kept loose here rather than guessing at a
// structure this phase doesn't own.
export const submitWorkPlanSchema = z.object({
  plannedTasks: z
    .array(z.object({ description: z.string().min(1) }))
    .min(1, "At least one planned task is required"),
  scheduleConfig: z.record(z.string(), z.unknown()).optional(),
});

export const reviewWorkPlanSchema = z.object({
  action: z.enum(["APPROVE", "RETURN"]),
  comments: z.string().min(1).optional(),
});
