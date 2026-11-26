// Time and credited-hours maths for SLU's internship rules. Pure (no Prisma
// import) so client components and services share one implementation.
import { z } from "zod";

export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");

const MIN_CREDITED_OT_MINUTES = 30;
const DAY_MIN = 24 * 60;

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
  const startMin = parseHHMM(schedule.startTime);
  const end = parseHHMM(schedule.endTime);
  return {
    startMin,
    // A night shift (e.g. 22:00 to 06:00, a US company) ends the next morning.
    endMin: end <= startMin ? end + DAY_MIN : end,
    breakMinutes: schedule.breakMinutes ?? 0,
    scheduledHours: schedule.hoursPerDay,
  };
}

export function toHHMM(minutes: number): string {
  minutes = ((minutes % DAY_MIN) + DAY_MIN) % DAY_MIN; // past midnight on a night shift
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// Minutes from `a` to `b`; an earlier `b` is the next morning (a night shift). 0 when equal.
export function spanMinutes(a: string, b: string): number {
  return (parseHHMM(b) - parseHHMM(a) + DAY_MIN) % DAY_MIN;
}

// A day's time ranges as minutes on one timeline that runs past midnight: a time earlier than
// the one before it is the next day. On an overnight shift an arrival more than 12 hours
// before the start (00:30 for a 22:00 shift) is after midnight, so it is late, not early.
export function dayTimeline(
  ranges: Array<[string, string]>,
  shift: Shift | null = null
): Array<[number, number]> {
  let offset =
    shift &&
    ranges.length &&
    shift.endMin > DAY_MIN &&
    parseHHMM(ranges[0][0]) < shift.startMin - 720
      ? DAY_MIN
      : 0;
  let prev = -Infinity;
  return ranges.map(([a, b]) => {
    let start = parseHHMM(a) + offset;
    if (start < prev) {
      offset += DAY_MIN;
      start += DAY_MIN;
    }
    let end = parseHHMM(b) + offset;
    if (end <= start) {
      offset += DAY_MIN;
      end += DAY_MIN;
    }
    prev = end;
    return [start, end] as [number, number];
  });
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
  const line = dayTimeline(ranges, shift);
  const firstIn = line[0][0];
  const lastOut = line[line.length - 1][1];
  const gaps: DayGap[] = [];
  if (firstIn > shift.startMin) {
    gaps.push({ kind: "late", start: toHHMM(shift.startMin), end: toHHMM(firstIn) });
  }
  if (lastOut < shift.endMin) {
    gaps.push({ kind: "early", start: toHHMM(lastOut), end: toHHMM(shift.endMin) });
  }
  return gaps;
}

// A request covers a gap only when its time range spans the whole gap. Shared
// by the weekly submit gate and the automatic deduction count.
export function isGapCovered(
  gap: DayGap,
  requests: Array<{ startTime: string | null; endTime: string | null }>
): boolean {
  return requests.some(
    (r) =>
      (r.startTime === gap.start && r.endTime === gap.end) || // exact, also past midnight
      (r.startTime != null && r.endTime != null && r.startTime <= gap.start && r.endTime >= gap.end)
  );
}

export interface DayException {
  kind: "overtime" | "late" | "early";
  start: string | null; // "HH:MM"; null when a schedule without times can't place it
  end: string | null;
  minutes: number;
}

// What makes a worked day differ from the schedule, read straight from its times: late
// arrival and early leave (dayGaps) and overtime before the shift or after it. A day off
// worked is overtime in full. The weekly report asks for a reason only when this is non-empty.
export function dayExceptions(
  ranges: Array<[string, string]>,
  shift: Shift | null,
  scheduledDay: boolean,
  scheduledHours: number
): DayException[] {
  if (ranges.length === 0) return [];
  const line = dayTimeline(ranges, shift);
  const worked = line.reduce((sum, [a, b]) => sum + (b - a), 0);
  const first = line[0][0];
  const last = line[line.length - 1][1];
  if (!scheduledDay) {
    return [{ kind: "overtime", start: toHHMM(first), end: toHHMM(last), minutes: worked }];
  }
  if (!shift) {
    // No shift times (older schedules): compare the hours worked with the hours scheduled.
    const extra = worked - Math.round(scheduledHours * 60);
    if (extra > 0) return [{ kind: "overtime", start: null, end: null, minutes: extra }];
    if (extra < 0) return [{ kind: "early", start: null, end: null, minutes: -extra }];
    return [];
  }
  const out: DayException[] = dayGaps(ranges, shift).map((g) => ({
    ...g,
    minutes: g.kind === "late" ? first - shift.startMin : shift.endMin - last,
  }));
  if (first < shift.startMin) {
    out.push({
      kind: "overtime",
      start: toHHMM(first),
      end: toHHMM(shift.startMin),
      minutes: shift.startMin - first,
    });
  }
  if (last > shift.endMin) {
    out.push({
      kind: "overtime",
      start: toHHMM(shift.endMin),
      end: toHHMM(last),
      minutes: last - shift.endMin,
    });
  }
  return out;
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
  const ranges = dayTimeline(input.ranges, input.shift);
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

// Prefill for a schedule with hours but no start/end times (older schedules): 8:00 to noon,
// then from 1:00 PM for the rest of the scheduled hours, so the two ranges add up to exactly
// the scheduled day. Only a starting point the intern edits; never used to judge lateness.
export function defaultDayTimes(hours: number): {
  timeIn: string;
  timeOut: string;
  timeIn2: string;
  timeOut2: string;
} {
  const minutes = Math.round(hours * 60);
  if (minutes <= 4 * 60) {
    return { timeIn: "08:00", timeOut: toHHMM(8 * 60 + minutes), timeIn2: "", timeOut2: "" };
  }
  return {
    timeIn: "08:00",
    timeOut: "12:00",
    timeIn2: "13:00",
    timeOut2: toHHMM(13 * 60 + minutes - 4 * 60),
  };
}
