// Workstream L2: the deduction items IDSMS counts by itself — late or missing
// weekly work reports and undertime/absences without an approved request.
// Pure, so the rules are tested without a database.
import { addDays, getWeeklyReportDueInstant, toDateKey } from "@/lib/utils/reportDeadline";
import { dayGaps, isGapCovered, type Shift } from "@/lib/utils/timeMath";

export type AutomaticItemType = "LATE_WWR" | "MISSING_WWR" | "UNSUPPORTED_UT";

export interface AutomaticItem {
  itemType: AutomaticItemType;
  itemKey: string; // the week start (WWR items) or the day (UT), YYYY-MM-DD
  date: Date;
  detail: string;
  unjustified: boolean; // "no valid reason": adds the matrix's extra points
}

// Late and missing WWR are one family: an excuse given while a week was
// missing still applies once it is submitted late.
export const sameItemFamily = (a: string, b: string) =>
  a === b || (a.endsWith("_WWR") && b.endsWith("_WWR"));

interface HistoryEntry {
  type: string;
  late?: boolean;
  reasonForDelay?: string | null;
}

export interface AutomaticItemsInput {
  now: Date;
  shift: Shift | null;
  semesterEnd?: Date | null; // no missing weeks are counted past it
  reports: Array<{
    id: string;
    weekStart: Date;
    weekEnd: Date;
    revisionHistory: unknown;
    dailyEntries: Array<{
      reportDate: Date;
      scheduledHours: unknown;
      attendanceStatus: string;
      timeIn: string | null;
      timeOut: string | null;
      timeIn2: string | null;
      timeOut2: string | null;
    }>;
  }>;
  requests: Array<{
    deviationType: string;
    validationStatus: string;
    date: Date;
    endDate: Date | null;
    startTime: string | null;
    endTime: string | null;
  }>;
}

const covers = (r: AutomaticItemsInput["requests"][number], key: string) =>
  toDateKey(r.date) <= key && key <= toDateKey(r.endDate ?? r.date);

const history = (report: { revisionHistory: unknown } | undefined) =>
  Array.isArray(report?.revisionHistory) ? (report!.revisionHistory as HistoryEntry[]) : [];

export function findAutomaticItems(input: AutomaticItemsInput): AutomaticItem[] {
  const items: AutomaticItem[] = [];
  const reports = [...input.reports].sort((a, b) => +a.weekStart - +b.weekStart);
  const byWeek = new Map(reports.map((r) => [toDateKey(r.weekStart), r]));
  const isDue = (week: Date) => input.now > getWeeklyReportDueInstant(addDays(week, 6));

  // Weekly work reports, from the first report week through the last past-due
  // week (never past the semester end).
  // shortcut: an intern with no report at all isn't counted; add a start date
  // (deployment / Week 1) to count from if that case matters.
  if (reports.length > 0) {
    for (let week = reports[0].weekStart; ; week = addDays(week, 7)) {
      const hasReport = byWeek.has(toDateKey(week));
      if (!hasReport && (!isDue(week) || (input.semesterEnd && week > input.semesterEnd))) break;
      const weekKey = toDateKey(week);
      // The first submission decides lateness; resubmitting after a Return doesn't.
      const first = history(byWeek.get(weekKey)).find((h) => h.type === "SUBMITTED");
      if (first?.late) {
        items.push({
          itemType: "LATE_WWR",
          itemKey: weekKey,
          date: week,
          detail: `Week of ${weekKey} submitted late`,
          unjustified: !first.reasonForDelay,
        });
      } else if (!first && isDue(week)) {
        items.push({
          itemType: "MISSING_WWR",
          itemKey: weekKey,
          date: week,
          detail: `Week of ${weekKey} not submitted`,
          unjustified: true,
        });
      }
      if (week >= reports[reports.length - 1].weekStart && !isDue(addDays(week, 7))) break;
    }
  }

  // Undertime (late arrival / early leave) and absences on scheduled days of
  // submitted weeks (a draft isn't final yet).
  for (const report of reports) {
    if (!history(report).some((h) => h.type === "SUBMITTED")) continue;
    for (const e of report.dailyEntries) {
      if (Number(e.scheduledHours) <= 0) continue;
      const key = toDateKey(e.reportDate);
      // A returned (rejected) request is not a valid reason.
      const filed = input.requests.filter(
        (r) =>
          (r.deviationType === "UNDERTIME" || r.deviationType === "ABSENCE") &&
          r.validationStatus !== "REJECTED" &&
          covers(r, key)
      );
      const approved = filed.filter((r) => r.validationStatus === "VALIDATED");
      let detail: string | null = null;
      if (e.attendanceStatus === "ABSENT") {
        if (!approved.some((r) => r.deviationType === "ABSENCE" && r.startTime == null)) {
          detail = `Absent on ${key}`;
        }
      } else if (e.attendanceStatus === "PRESENT" && e.timeIn && e.timeOut) {
        const ranges: Array<[string, string]> = [[e.timeIn, e.timeOut]];
        if (e.timeIn2 && e.timeOut2) ranges.push([e.timeIn2, e.timeOut2]);
        const uncovered = dayGaps(ranges, input.shift).filter(
          (gap) => !isGapCovered(gap, approved)
        );
        if (uncovered.length > 0) {
          detail = uncovered
            .map((g) => `${g.kind === "late" ? "Late" : "Left early"} ${g.start}–${g.end}`)
            .join(", ");
        }
      }
      if (detail) {
        items.push({
          itemType: "UNSUPPORTED_UT",
          itemKey: key,
          date: e.reportDate,
          detail,
          unjustified: filed.length === 0, // a filed request, even pending, gave a reason
        });
      }
    }
  }
  return items;
}
