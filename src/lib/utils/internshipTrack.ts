import type { ReportState } from "@/lib/services/complianceService";
import { getWeeklyReportDueInstant, getWeekStartMonday } from "@/lib/utils/reportDeadline";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
export const MAX_TRACK_WEEKS = 30;

// One cell per internship week, from the first report to the projected finish.
export type TrackKind = "confirmed" | "review" | "returned" | "missing" | "open" | "ahead";

export interface TrackWeek {
  weekStart: Date;
  kind: TrackKind;
  isCurrent: boolean;
  isFinish: boolean;
}

export function buildInternshipTrack(input: {
  reports: { weekStart: Date; state: ReportState }[];
  projectedFinish: Date | null;
  now?: Date;
}): TrackWeek[] {
  const now = input.now ?? new Date();
  const current = getWeekStartMonday(now).getTime();
  const byWeek = new Map(input.reports.map((r) => [r.weekStart.getTime(), r.state]));
  const firstReport = Math.min(...input.reports.map((r) => r.weekStart.getTime()), current);
  const finish = input.projectedFinish ? getWeekStartMonday(input.projectedFinish).getTime() : null;
  const last = Math.max(current, finish ?? current, ...byWeek.keys());
  // shortcut: shows at most MAX_TRACK_WEEKS from the first report; a longer internship would need paging.
  const end = Math.min(last, firstReport + (MAX_TRACK_WEEKS - 1) * WEEK_MS);

  const weeks: TrackWeek[] = [];
  for (let t = firstReport; t <= end; t += WEEK_MS) {
    const weekStart = new Date(t);
    const pastDue = now > getWeeklyReportDueInstant(new Date(t + 6 * DAY_MS));
    weeks.push({
      weekStart,
      kind: kindFor(byWeek.get(t), t, current, pastDue),
      isCurrent: t === current,
      isFinish: t === finish,
    });
  }
  return weeks;
}

function kindFor(
  state: ReportState | undefined,
  week: number,
  current: number,
  pastDue: boolean
): TrackKind {
  if (state === "APPROVED" || state === "REGARDED") return "confirmed";
  if (state === "SUBMITTED") return "review";
  if (state === "RETURNED") return "returned";
  if (week > current) return "ahead";
  return pastDue ? "missing" : "open";
}
