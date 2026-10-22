import type { ComplianceStatus } from "@/lib/services/complianceService";
import type { TrackKind } from "@/lib/utils/internshipTrack";

type Row = { status: ComplianceStatus; hoursPercent: number; recentWeeks: TrackKind[] };

// Drawing order of the status bar: finished work first, the idle grey last.
export const STATUS_ORDER: ComplianceStatus[] = [
  "COMPLETED",
  "ON_TRACK",
  "NEEDS_ATTENTION",
  "NOT_DEPLOYED",
];

export function statusCounts(rows: Row[]): Record<ComplianceStatus, number> {
  const counts = { COMPLETED: 0, ON_TRACK: 0, NEEDS_ATTENTION: 0, NOT_DEPLOYED: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
}

export const WEEK_KINDS = ["confirmed", "review", "returned", "missing", "open"] as const;
export type WeekKind = (typeof WEEK_KINDS)[number];
export type WeekColumn = { weeksAgo: number; counts: Record<WeekKind, number>; total: number };

// One column per recent week, oldest first. Interns who started later have shorter
// tracks; every track ends at the current week, so they are aligned from the right.
export function weeklyColumns(rows: Row[], weeks = 8): WeekColumn[] {
  return Array.from({ length: weeks }, (_, i) => {
    const weeksAgo = weeks - 1 - i;
    const counts = { confirmed: 0, review: 0, returned: 0, missing: 0, open: 0 };
    for (const r of rows) {
      const kind = r.recentWeeks[r.recentWeeks.length - 1 - weeksAgo];
      if (kind && kind !== "ahead") counts[kind]++;
    }
    return { weeksAgo, counts, total: WEEK_KINDS.reduce((s, k) => s + counts[k], 0) };
  });
}

export const HOURS_BUCKETS = ["0–24%", "25–49%", "50–74%", "75–99%", "100%"] as const;

export function hoursBuckets(rows: Row[]): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const r of rows)
    out[r.hoursPercent >= 100 ? 4 : Math.floor(Math.max(0, r.hoursPercent) / 25)]++;
  return out;
}
