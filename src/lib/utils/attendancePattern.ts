// Habitual absence or lateness for the faculty roster: counts over the last four weeks, so an
// adviser sees a pattern without opening every week. Pure: the compliance query passes its rows.
import { dayTimeline, type Shift } from "@/lib/utils/timeMath";

export const PATTERN_DAYS = 28;
export const PATTERN_THRESHOLD = 3;

export interface PatternEntry {
  reportDate: Date;
  attendanceStatus: string;
  scheduledHours: unknown; // Prisma Decimal or number
  timeIn: string | null;
}

export interface AttendancePattern {
  absences: number;
  lateArrivals: number;
}

export function attendancePattern(
  entries: PatternEntry[],
  shift: Shift | null,
  now: Date
): AttendancePattern {
  const since = now.getTime() - PATTERN_DAYS * 86_400_000;
  let absences = 0;
  let lateArrivals = 0;
  for (const e of entries) {
    const t = e.reportDate.getTime();
    if (t < since || t > now.getTime() || Number(e.scheduledHours) <= 0) continue;
    if (e.attendanceStatus === "ABSENT") absences++;
    else if (
      e.attendanceStatus === "PRESENT" &&
      shift &&
      e.timeIn &&
      dayTimeline([[e.timeIn, e.timeIn]], shift)[0][0] > shift.startMin
    )
      lateArrivals++;
  }
  return { absences, lateArrivals };
}

// The roster's one-line note, or null when nothing reaches the threshold.
export function patternNote({ absences, lateArrivals }: AttendancePattern): string | null {
  const parts = [
    absences >= PATTERN_THRESHOLD && `Absent ${absences}×`,
    lateArrivals >= PATTERN_THRESHOLD && `Late ${lateArrivals}×`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")} in 4 weeks` : null;
}
