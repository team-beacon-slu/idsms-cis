import { z } from "zod";
import { timeOfDay } from "@/lib/utils/timeMath";

export const weeklyReportGenerateSchema = z.object({
  weekStart: z.coerce.date(),
});

// The statuses a student can pick per day. The generated value SCHEDULED
// (an unfilled day) is stored too but never submitted from the form.
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HOLIDAY"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export { timeOfDay };

export function minutesBetween(timeIn: string, timeOut: string): number {
  const [inH, inM] = timeIn.split(":").map(Number);
  const [outH, outM] = timeOut.split(":").map(Number);
  return outH * 60 + outM - (inH * 60 + inM);
}

export const dailyEntrySchema = z
  .object({
    dailyReportEntryId: z.uuid(),
    hours: z.number().min(0).max(24),
    accomplishments: z.string().trim().max(5000),
    toolsUsed: z.string().trim().max(500).optional(),
    attendanceStatus: z.enum(ATTENDANCE_STATUSES).default("PRESENT"),
    timeIn: timeOfDay.optional(),
    timeOut: timeOfDay.optional(),
    timeIn2: timeOfDay.optional(),
    timeOut2: timeOfDay.optional(),
  })
  .refine((d) => d.attendanceStatus !== "PRESENT" || d.accomplishments.length > 0, {
    message: "Accomplishments are required",
    path: ["accomplishments"],
  })
  .refine((d) => d.attendanceStatus === "PRESENT" || d.hours === 0, {
    message: "Absent and holiday days must have 0 hours",
    path: ["hours"],
  })
  .refine((d) => !d.timeIn || !d.timeOut || minutesBetween(d.timeIn, d.timeOut) > 0, {
    message: "Time out must be after time in",
    path: ["timeOut"],
  })
  .refine(
    (d) => (!d.timeIn2 && !d.timeOut2) || (d.timeIn && d.timeOut && d.timeIn2 && d.timeOut2),
    {
      message: "Fill in the first time range before adding a second",
      path: ["timeIn2"],
    }
  )
  .refine((d) => !d.timeIn2 || !d.timeOut2 || minutesBetween(d.timeIn2, d.timeOut2) > 0, {
    message: "Time out must be after time in",
    path: ["timeOut2"],
  })
  .refine((d) => !d.timeOut || !d.timeIn2 || minutesBetween(d.timeOut, d.timeIn2) >= 0, {
    message: "The second time range must start after the first one ends",
    path: ["timeIn2"],
  })
  .refine((d) => !d.timeIn || !d.timeOut || d.hours * 60 <= rangeMinutes(d) + 0.5, {
    message: "Hours can't exceed the time between time in and time out",
    path: ["hours"],
  });

// Total minutes across the day's one or two time ranges.
export function rangeMinutes(d: {
  timeIn?: string | null;
  timeOut?: string | null;
  timeIn2?: string | null;
  timeOut2?: string | null;
}): number {
  const first = d.timeIn && d.timeOut ? minutesBetween(d.timeIn, d.timeOut) : 0;
  const second = d.timeIn2 && d.timeOut2 ? minutesBetween(d.timeIn2, d.timeOut2) : 0;
  return first + second;
}

export const weeklyReportSubmitSchema = z.object({
  reasonForDelay: z.string().min(1).optional(),
});

export const weeklyReportReviewSchema = z
  .object({
    action: z.enum(["APPROVE", "RETURN", "REGARD", "DISREGARD"]),
    notes: z.string().min(1).optional(),
  })
  .refine((data) => data.action !== "RETURN" || Boolean(data.notes), {
    message: "Notes are required when returning a report",
    path: ["notes"],
  });

export const monthlyReportSchema = z.object({
  // Month must be 01-12 — a shape-only \d{4}-\d{2} check would let
  // "2026-13" through and silently roll into the wrong calendar year in
  // monthlyReportService's UTC month-boundary math.
  calendarMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM"),
});
