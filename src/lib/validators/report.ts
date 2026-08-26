import { z } from "zod";

export const weeklyReportGenerateSchema = z.object({
  weekStart: z.coerce.date(),
});

export const dailyEntrySchema = z.object({
  hours: z.number().min(0).max(24),
  accomplishments: z.string().min(1, "Accomplishments are required"),
});

export const weeklyReportSubmitSchema = z.object({
  reasonForDelay: z.string().min(1).optional(),
});

export const weeklyReportReviewSchema = z.object({
  action: z.enum(["APPROVE", "RETURN", "REGARD", "DISREGARD"]),
  notes: z.string().min(1).optional(),
});

export const monthlyReportSchema = z.object({
  calendarMonth: z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
});
