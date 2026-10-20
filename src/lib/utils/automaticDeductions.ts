// Workstream L2: the deduction items IDSMS counts by itself — late or missing
// weekly work reports and undertime/absences without an approved request.
// Pure, so the rules are tested without a database.
import { addDays, getWeeklyReportDueInstant, toDateKey } from "@/lib/utils/reportDeadline";
import { dayGaps, type Shift } from "@/lib/utils/timeMath";

export type AutomaticItemType = "LATE_WWR" | "MISSING_WWR" | "UNSUPPORTED_UT";

export interface AutomaticItem {
  itemType: AutomaticItemType;
  itemKey: string; // weeklyReportId, or a YYYY-MM-DD date
  date: Date;
  detail: string;
  unjustified: boolean; // "no valid reason": adds the matrix's extra points
}

interface HistoryEntry {
  type: string;
  late?: boolean;
  reasonForDelay?: string | null;
}

export interface AutomaticItemsInput {
  now: Date;
  shift: Shift | null;
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

export function findAutomaticItems(input: AutomaticItemsInput): AutomaticItem[] {
  const items: AutomaticItem[] = [];
  const reports = [...input.reports].sort((a, b) => +a.weekStart - +b.weekStart);
  const byWeek = new Map(reports.map((r) => [toDateKey(r.weekStart), r]));

  // Weekly work reports, from the first report week to the last one.
  if (reports.length > 0) {
    for (
      let week = reports[0].weekStart;
      week <= reports[reports.length - 1].weekStart;
      week = addDays(week, 7)
    ) {
      const weekKey = toDateKey(week);
      const report = byWeek.get(weekKey);
      const history = Array.isArray(report?.revisionHistory)
        ? (report!.revisionHistory as HistoryEntry[])
        : [];
      // The first submission decides lateness; resubmitting after a Return doesn't.
      const first = history.find((h) => h.type === "SUBMITTED");
      if (first?.late) {
        items.push({
          itemType: "LATE_WWR",
          itemKey: report!.id,
          date: week,
          detail: `Week of ${weekKey} submitted late`,
          unjustified: !first.reasonForDelay,
        });
      } else if (!first && input.now > getWeeklyReportDueInstant(addDays(week, 6))) {
        items.push({
          itemType: "MISSING_WWR",
          itemKey: weekKey,
          date: week,
          detail: `Week of ${weekKey} not submitted`,
          unjustified: true,
        });
      }
    }
  }

  // Undertime (late arrival / early leave) and absences on scheduled days.
  for (const report of reports) {
    for (const e of report.dailyEntries) {
      if (Number(e.scheduledHours) <= 0) continue;
      const key = toDateKey(e.reportDate);
      const sameDay = input.requests.filter(
        (r) => (r.deviationType === "UNDERTIME" || r.deviationType === "ABSENCE") && covers(r, key)
      );
      const approved = sameDay.filter((r) => r.validationStatus === "VALIDATED");
      let detail: string | null = null;
      if (e.attendanceStatus === "ABSENT") {
        if (!approved.some((r) => r.deviationType === "ABSENCE")) detail = `Absent on ${key}`;
      } else if (e.attendanceStatus === "PRESENT" && e.timeIn && e.timeOut) {
        const ranges: Array<[string, string]> = [[e.timeIn, e.timeOut]];
        if (e.timeIn2 && e.timeOut2) ranges.push([e.timeIn2, e.timeOut2]);
        const uncovered = dayGaps(ranges, input.shift).filter(
          (gap) =>
            !approved.some(
              (r) =>
                r.deviationType === "UNDERTIME" ||
                (r.startTime != null &&
                  r.endTime != null &&
                  r.startTime <= gap.start &&
                  r.endTime >= gap.end)
            )
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
          unjustified: sameDay.length === 0, // a filed request, even pending, gave a reason
        });
      }
    }
  }
  return items;
}
