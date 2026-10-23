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
    // Faculty-defined start of Week 1 (weekly report numbering).
    weekOneStart: z.coerce.date().optional(),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "The end date must be after the start date",
    path: ["endDate"],
  });

export const semesterWeekOneSchema = z.object({
  weekOneStart: z.coerce.date().nullable(),
});
