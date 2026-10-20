import { z } from "zod";

export const conductRecordSchema = z.object({
  categoryKey: z.string().min(1),
  weight: z.union([z.literal(1), z.literal(2)]).default(1),
  date: z.coerce.date(),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
  hoursDeducted: z.number().min(0).max(40).optional(),
});

export const revokeReasonSchema = z
  .string()
  .trim()
  .min(10, "Give a reason of at least 10 characters")
  .max(500);
