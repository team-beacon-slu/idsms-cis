// SLU policy (Nov 2026): a weekly report covers Monday to Friday. A Saturday or Sunday is in
// it only when the intern worked it (an added day). Weekdays outside the intern's schedule
// still show, as a day off, so the report always reads Mon–Fri. Shared by the form, the read-only
// view and the PDF, so they can't disagree. Pure: client and server use it.
import { addDays, toDateKey } from "@/lib/utils/reportDeadline";

const keyOf = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : toDateKey(d));

export interface ReportDay<T> {
  date: Date; // UTC midnight
  key: string; // "YYYY-MM-DD"
  entry: T | null; // null: a weekday off (not in the schedule, nothing worked)
}

export function reportDays<T extends { reportDate: Date | string }>(
  weekStart: Date,
  entries: T[]
): ReportDay<T>[] {
  const byKey = new Map(entries.map((e) => [keyOf(e.reportDate), e]));
  const days: ReportDay<T>[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const key = toDateKey(date);
    const entry = byKey.get(key) ?? null;
    if (i < 5 || entry) days.push({ date, key, entry }); // Sat/Sun only when worked
  }
  // A saved day is never hidden, even one outside the expected week.
  const listed = new Set(days.map((d) => d.key));
  for (const [key, entry] of byKey) {
    if (!listed.has(key)) days.push({ date: new Date(`${key}T00:00:00.000Z`), key, entry });
  }
  return days.sort((a, b) => a.key.localeCompare(b.key));
}

// The report's printed period: Monday to Friday, or to the weekend day worked.
export function reportPeriodEnd(
  weekStart: Date,
  entries: Array<{ reportDate: Date | string }>
): Date {
  const days = reportDays(weekStart, entries);
  return days[days.length - 1].date;
}
