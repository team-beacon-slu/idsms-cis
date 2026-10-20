// Time and credited-hours maths for SLU's internship rules. Pure (no Prisma
// import) so client components and services share one implementation.
import { z } from "zod";

export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

const MIN_CREDITED_OT_MINUTES = 30;

export function parseHHMM(t: string): number {
  if (!timeOfDay.safeParse(t).success) throw new Error(`Invalid time "${t}", expected HH:MM`);
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function formatHrsMins(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hrs = `${h} ${h === 1 ? "hr" : "hrs"}`;
  const mins = `${m} ${m === 1 ? "min" : "mins"}`;
  if (m === 0) return hrs;
  return h === 0 ? mins : `${hrs} ${mins}`;
}

export function overlapMinutes(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

export interface Shift {
  startMin: number;
  endMin: number;
  breakMinutes: number;
  scheduledHours: number;
}

export function scheduleShift(schedule: {
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  hoursPerDay: number;
}): Shift | null {
  if (!schedule.startTime || !schedule.endTime) return null;
  return {
    startMin: parseHHMM(schedule.startTime),
    endMin: parseHHMM(schedule.endTime),
    breakMinutes: schedule.breakMinutes ?? 0,
    scheduledHours: schedule.hoursPerDay,
  };
}

export function toHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export interface DayGap {
  kind: "late" | "early";
  start: string; // "HH:MM"
  end: string;
}

// Late arrival and early leave against the shift (no grace period). These
// need an undertime request before the week can be submitted.
export function dayGaps(ranges: Array<[string, string]>, shift: Shift | null): DayGap[] {
  if (!shift || ranges.length === 0) return [];
  const firstIn = parseHHMM(ranges[0][0]);
  const lastOut = parseHHMM(ranges[ranges.length - 1][1]);
  const gaps: DayGap[] = [];
  if (firstIn > shift.startMin) {
    gaps.push({ kind: "late", start: toHHMM(shift.startMin), end: toHHMM(firstIn) });
  }
  if (lastOut < shift.endMin) {
    gaps.push({ kind: "early", start: toHHMM(lastOut), end: toHHMM(shift.endMin) });
  }
  return gaps;
}

export interface DayCreditInput {
  ranges: Array<[string, string]>;
  shift: Shift | null;
  scheduledDay: boolean;
  scheduledHours: number;
  actualHours: number | null;
  approvedOtMinutes: number;
}

export interface DayCredit {
  workedHours: number;
  baseHours: number;
  extraMinutes: number;
  creditedOtHours: number;
  creditedHours: number;
  tardy: boolean;
  earlyLeave: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeDayCredit(input: DayCreditInput): DayCredit {
  const ranges = input.ranges.map(([a, b]) => [parseHHMM(a), parseHHMM(b)] as [number, number]);
  const workedMin = ranges.length
    ? ranges.reduce((sum, [a, b]) => sum + (b - a), 0)
    : Math.round(Number(input.actualHours ?? 0) * 60);
  const capMin = input.scheduledDay ? input.scheduledHours * 60 : 0;

  let baseMin: number;
  let tardy = false;
  let earlyLeave = false;
  const shift = input.shift;
  if (shift && ranges.length && input.scheduledDay) {
    const window: [number, number] = [shift.startMin, shift.endMin];
    const inWindow = ranges.reduce((sum, r) => sum + overlapMinutes(r, window), 0);
    // Unworked time inside the shift already counts as (part of) the break.
    const unworked = shift.endMin - shift.startMin - inWindow;
    const breakLeft = Math.max(0, shift.breakMinutes - unworked);
    baseMin = Math.min(Math.max(0, inWindow - breakLeft), capMin);
    tardy = ranges[0][0] > shift.startMin;
    earlyLeave = ranges[ranges.length - 1][1] < shift.endMin;
    const extraMin = workedMin - inWindow;
    return finish(workedMin, baseMin, extraMin, tardy, earlyLeave, input.approvedOtMinutes);
  }

  // Legacy fallback (no shift times or no ranges) and non-scheduled days.
  baseMin = Math.min(workedMin, capMin);
  return finish(
    workedMin,
    baseMin,
    workedMin - baseMin,
    tardy,
    earlyLeave,
    input.approvedOtMinutes
  );
}

function finish(
  workedMin: number,
  baseMin: number,
  extraMin: number,
  tardy: boolean,
  earlyLeave: boolean,
  approvedOtMinutes: number
): DayCredit {
  const otMin =
    approvedOtMinutes > 0 && extraMin >= MIN_CREDITED_OT_MINUTES && !tardy
      ? Math.min(extraMin, approvedOtMinutes)
      : 0;
  return {
    workedHours: workedMin / 60,
    baseHours: round2(baseMin / 60),
    extraMinutes: extraMin,
    creditedOtHours: round2(otMin / 60),
    creditedHours: round2((baseMin + otMin) / 60),
    tardy,
    earlyLeave,
  };
}
