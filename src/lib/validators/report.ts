import { z } from "zod";
import { PROOF_TYPES } from "@/lib/validators/timeRequest";
import { dayTimeline, spanMinutes, timeOfDay } from "@/lib/utils/timeMath";

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

// Minutes worked between two times; a time out earlier than time in is the next morning.
export function minutesBetween(timeIn: string, timeOut: string): number {
  return valid(timeIn, timeOut) ? spanMinutes(timeIn, timeOut) : NaN;
}

// The cross-field checks below only judge well-formed times; timeOfDay reports the rest.
const valid = (...times: Array<string | null | undefined>) =>
  times.every((t) => t != null && timeOfDay.safeParse(t).success);

export const DAY_NOTE_MIN = 10;
export const dayNoteSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, "Keep the reason under 500 characters")
    .refine((r) => r.length === 0 || r.length >= DAY_NOTE_MIN, {
      message: `Give a reason of at least ${DAY_NOTE_MIN} characters`,
    }),
  proofType: z.enum(PROOF_TYPES).optional(),
  requestKind: z.enum(["ANTICIPATED", "EMERGENCY"]).optional(),
});
export type DayNote = z.infer<typeof dayNoteSchema>;

export const dailyEntrySchema = z
  .object({
    dailyReportEntryId: z.uuid(),
    hours: z.number().min(0).max(24),
    accomplishments: z.string().trim().max(5000, "Keep this under 5,000 characters"),
    toolsUsed: z.string().trim().max(500, "Keep the tools under 500 characters").optional(),
    attendanceStatus: z.enum(ATTENDANCE_STATUSES).default("PRESENT"),
    timeIn: timeOfDay.optional(),
    timeOut: timeOfDay.optional(),
    timeIn2: timeOfDay.optional(),
    timeOut2: timeOfDay.optional(),
    // Why this day differs from the schedule (overtime, undertime or an absence): reported on
    // the day itself instead of a separate request (adviser feedback, Nov 2026).
    note: dayNoteSchema.optional(),
  })
  .refine((d) => d.attendanceStatus !== "ABSENT" || (d.note?.reason.length ?? 0) > 0, {
    message: "Say why you were absent",
    path: ["note", "reason"],
  })
  .refine((d) => d.attendanceStatus !== "ABSENT" || Boolean(d.note?.proofType), {
    message: "Choose the proof you will attach in Google Classroom",
    path: ["note", "proofType"],
  })
  .refine((d) => d.attendanceStatus !== "PRESENT" || d.accomplishments.length > 0, {
    message: "Accomplishments are required",
    path: ["accomplishments"],
  })
  .refine((d) => d.attendanceStatus === "PRESENT" || d.hours === 0, {
    message: "Absent and holiday days must have 0 hours",
    path: ["hours"],
  })
  .refine((d) => !valid(d.timeIn, d.timeOut) || minutesBetween(d.timeIn!, d.timeOut!) > 0, {
    message: "Time in and time out can't be the same",
    path: ["timeOut"],
  })
  .refine(
    (d) => (!d.timeIn2 && !d.timeOut2) || (d.timeIn && d.timeOut && d.timeIn2 && d.timeOut2),
    {
      message: "Enter the AM Time In and Time Out, or leave both PM times empty",
      path: ["timeIn2"],
    }
  )
  .refine((d) => !valid(d.timeIn2, d.timeOut2) || minutesBetween(d.timeIn2!, d.timeOut2!) > 0, {
    message: "Time in and time out can't be the same",
    path: ["timeOut2"],
  })
  .refine(
    (d) =>
      !valid(d.timeIn, d.timeOut, d.timeIn2, d.timeOut2) ||
      daySpan([d.timeIn!, d.timeOut!, d.timeIn2!, d.timeOut2!]) <= 24 * 60,
    {
      message: "The PM Time In must be after the AM Time Out, within 24 hours",
      path: ["timeIn2"],
    }
  )
  .refine((d) => !valid(d.timeIn, d.timeOut) || d.hours * 60 <= rangeMinutes(d) + 0.5, {
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
  const first = valid(d.timeIn, d.timeOut) ? minutesBetween(d.timeIn!, d.timeOut!) : 0;
  const second = valid(d.timeIn2, d.timeOut2) ? minutesBetween(d.timeIn2!, d.timeOut2!) : 0;
  return first + second;
}

// First time in to last time out, on one timeline that runs past midnight.
function daySpan([in1, out1, in2, out2]: string[]) {
  const line = dayTimeline([
    [in1, out1],
    [in2, out2],
  ]);
  return line[1][1] - line[0][0];
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
  })
  // Disregard deletes the week's report: the intern needs to know why.
  .refine((data) => data.action !== "DISREGARD" || Boolean(data.notes), {
    message: "Give the intern a reason when you disregard a week",
    path: ["notes"],
  });

export const learningJournalSchema = z.object({
  calendarMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM"),
  narrative: z.string().max(20000, "Keep the journal under 20,000 characters"),
  office: z.string().trim().max(150, "Keep the office name under 150 characters"),
});

export const monthlyReportSchema = z.object({
  // Month must be 01-12 — a shape-only \d{4}-\d{2} check would let
  // "2026-13" through and silently roll into the wrong calendar year in
  // monthlyReportService's UTC month-boundary math.
  calendarMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM"),
});
