"use client";

import { NotebookPen } from "lucide-react";

// FR-WR-02, FR-WR-03 — Owner: gu457 (Ulrich)
// Requirement: daily accomplishment entry UI — one row per scheduled day
// (hours + accomplishments + tools used), showing live running totals.
// Connects to: PATCH /api/weekly-reports/[id] (Task 12 route) →
// `weeklyReportService.saveDailyAccomplishment` (Task 4), which the route
// already chains with `calculateWeeklyTotalHours`/
// `calculateRunningTotalAndRemaining` and returns in one response — this
// component just needs to read `{ entry, totalHours, runningTotal,
// remainingHours }` from that response and re-render. Before submit, call
// `detectCopyPasteWarning` from `./copy-paste-warning.ts` (F7, same task)
// to block submission on a near-duplicate accomplishment entry.
// Edge cases: none beyond standard form validation.
export function WeeklyReportForm({ weeklyReportId }: { weeklyReportId: string }) {
  return (
    <div
      data-testid="weekly-report-form"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground"
    >
      <NotebookPen className="size-6 text-muted-foreground" aria-hidden="true" />
      <p>Weekly report form for {weeklyReportId} — not yet implemented (see issue #39).</p>
    </div>
  );
}
