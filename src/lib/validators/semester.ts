import { z } from "zod";

export const createSemesterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a semester name")
      .max(80, "Keep the name under 80 characters"),
    academicYear: z.string().regex(/^\d{4}-\d{4}$/, "Use the format 2026-2027"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "The end date must be after the start date",
    path: ["endDate"],
  });
