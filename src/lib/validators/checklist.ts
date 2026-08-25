import { z } from "zod";

export const reviewChecklistItemSchema = z.object({
  action: z.enum(["APPROVE", "RETURN"]),
  comments: z.string().min(1).optional(),
});
