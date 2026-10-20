// Workstream L1: leave, overtime and undertime requests (the reworked
// DeviationReport). No uploads (D2/D7): proof goes to Google Classroom, the
// form only records what kind of proof the student will attach there.
import { z } from "zod";
import { parseHHMM, timeOfDay } from "@/lib/utils/timeMath";

export const PROOF_TYPES = ["MEDICAL_CERTIFICATE", "PROOF_OF_LEAVE", "WRITTEN_NOTICE"] as const;
const MAX_LEAVE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const timeRequestSchema = z
  .object({
    deviationType: z.enum(["ABSENCE", "OVERTIME", "UNDERTIME"]),
    requestKind: z.enum(["ANTICIPATED", "EMERGENCY"]),
    date: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    startTime: timeOfDay.optional(),
    endTime: timeOfDay.optional(),
    reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500),
    proofType: z.enum(PROOF_TYPES).optional(),
  })
  .superRefine((r, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const hasTimes = Boolean(r.startTime || r.endTime);

    if (!r.startTime !== !r.endTime) issue("endTime", "Give both a start and an end time");
    if (r.startTime && r.endTime && parseHHMM(r.endTime) <= parseHHMM(r.startTime)) {
      issue("endTime", "End time must be after start time");
    }

    if (r.deviationType === "ABSENCE") {
      if (!r.proofType) issue("proofType", "Choose the proof you will attach in Google Classroom");
      if (r.endDate && hasTimes) issue("endDate", "A partial-day leave covers one date only");
      if (r.endDate) {
        const span = Math.round((r.endDate.getTime() - r.date.getTime()) / DAY_MS) + 1;
        if (span < 1) issue("endDate", "End date can't be before the start date");
        if (span > MAX_LEAVE_DAYS)
          issue("endDate", `A leave can cover at most ${MAX_LEAVE_DAYS} days`);
      }
    } else {
      if (!hasTimes) issue("startTime", "Give the start and end time");
      if (r.endDate) issue("endDate", "Only a leave can cover several days");
    }
  });

export type TimeRequestInput = z.infer<typeof timeRequestSchema>;

export function requestedMinutes(r: { startTime?: string; endTime?: string }): number | null {
  return r.startTime && r.endTime ? parseHHMM(r.endTime) - parseHHMM(r.startTime) : null;
}

export const timeRequestReviewSchema = z
  .object({
    action: z.enum(["APPROVE", "RETURN"]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((r) => r.action !== "RETURN" || Boolean(r.note), {
    message: "Add a note telling the student what to fix",
    path: ["note"],
  });
