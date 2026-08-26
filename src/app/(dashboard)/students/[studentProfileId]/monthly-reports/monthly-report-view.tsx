"use client";

// FR-WR-08 — Owner: AndresBonifaci0 (Matt)
// Requirement: eligibility status, a submit action, and a read-only rollup
// of the month's qualifying weekly reports.
// Connects to: eligibility from `checkMonthlyAggregationEligibility`
// (`monthlyReportService.ts`, Task 5) — the route (POST
// /api/students/[studentProfileId]/monthly-reports, Task 13) already
// enforces this gate server-side, but the UI should surface it before the
// user clicks submit, not just after a rejected POST. Submit calls that
// same POST route → `submitMonthlyReport` (Task 5). Rollup data comes from
// GET on the same route → `listMonthlyReportsForStudent` (Task 5), plus
// whatever weekly reports the eligibility check covers (fetch via
// `weeklyReportService.listWeeklyReportsForStudent`, Task 4, filtered
// client-side to the given `calendarMonth`).
// Edge cases: none beyond standard form/gate UX.
export function MonthlyReportView({
  studentProfileId,
  calendarMonth,
}: {
  studentProfileId: string;
  calendarMonth: string;
}) {
  return (
    <div data-testid="monthly-report-view" className="text-sm text-muted-foreground">
      Monthly report for {studentProfileId} / {calendarMonth} — not yet implemented (see issue #40).
    </div>
  );
}
