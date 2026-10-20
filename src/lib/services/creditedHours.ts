// Workstream L1: computes a stored DailyReportEntry's creditedHours under
// SLU's rules. recomputeCreditedHours (which also refreshes the weekly
// totals) lives in weeklyReportService so the service imports stay acyclic.
import { DeviationType, Prisma, PrismaClient, ValidationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/workPlanService";
import { toDateKey } from "@/lib/utils/reportDeadline";
import { parseScheduleConfig } from "@/lib/utils/schedule";
import { computeDayCredit, scheduleShift, type Shift } from "@/lib/utils/timeMath";

export interface CreditContext {
  shift: Shift | null;
  otMinutesByDate: Map<string, number>; // "YYYY-MM-DD" → approved OT minutes
}

type Num = Prisma.Decimal | number | null;

export interface CreditInputEntry {
  reportDate: Date;
  scheduledHours: Num;
  actualHours: Num;
  attendanceStatus: string;
  timeIn: string | null;
  timeOut: string | null;
  timeIn2: string | null;
  timeOut2: string | null;
}

// The student's shift from their latest approved schedule; null when it has
// no start/end times (legacy schedule) or there is no schedule.
// shortcut: uses the latest shift for every date, so re-crediting or
// re-submitting a week from before a schedule change uses the new shift;
// upgrade to a dated shift history if mid-term schedule changes become common.
export async function loadShift(studentProfileId: string): Promise<Shift | null> {
  const workPlan = await getLatestApprovedWorkPlanForStudent(studentProfileId);
  const schedule = parseScheduleConfig(workPlan?.scheduleConfig);
  return schedule ? scheduleShift(schedule) : null;
}

export async function loadCreditContext(
  studentProfileId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<CreditContext> {
  const [shift, overtime] = await Promise.all([
    loadShift(studentProfileId),
    client.deviationReport.findMany({
      where: {
        studentProfileId,
        deviationType: DeviationType.OVERTIME,
        validationStatus: ValidationStatus.VALIDATED,
      },
      select: { date: true, requestedMinutes: true },
    }),
  ]);
  const otMinutesByDate = new Map<string, number>();
  for (const r of overtime) {
    const key = toDateKey(r.date);
    // Legacy approved OT has no minutes: don't cap it.
    otMinutesByDate.set(key, (otMinutesByDate.get(key) ?? 0) + (r.requestedMinutes ?? Infinity));
  }
  return { shift, otMinutesByDate };
}

// Null for an unfilled day (no hours entered yet).
export function creditForEntry(e: CreditInputEntry, ctx: CreditContext): number | null {
  if (e.attendanceStatus === "ABSENT" || e.attendanceStatus === "HOLIDAY") return 0;
  if (e.actualHours == null) return null;
  const actual = Number(e.actualHours);
  const ranges: Array<[string, string]> = [];
  if (e.timeIn && e.timeOut) ranges.push([e.timeIn, e.timeOut]);
  if (e.timeIn2 && e.timeOut2) ranges.push([e.timeIn2, e.timeOut2]);
  const scheduledHours = Number(e.scheduledHours ?? 0);
  const credit = computeDayCredit({
    ranges,
    shift: ctx.shift,
    scheduledDay: scheduledHours > 0,
    scheduledHours,
    actualHours: actual,
    approvedOtMinutes: ctx.otMinutesByDate.get(toDateKey(e.reportDate)) ?? 0,
  });
  // Never credit more than the hours the student entered.
  return Math.min(credit.creditedHours, actual);
}
