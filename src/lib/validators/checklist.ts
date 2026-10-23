import { z } from "zod";

// With no files stored in IDSMS (D7), the reviewer's note is the only way a
// student learns why an item was returned, so RETURN requires one.
export const reviewChecklistItemSchema = z
  .object({
    action: z.enum(["APPROVE", "RETURN"]),
    comments: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => value.action !== "RETURN" || value.comments !== undefined, {
    message: "A note is required when returning an item",
    path: ["comments"],
  });
