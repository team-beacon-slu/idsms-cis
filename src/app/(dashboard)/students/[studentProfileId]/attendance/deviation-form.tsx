"use client";

// FR-AT-03 — Owner: gu457 (Ulrich)
// Requirement: date, reason category, supporting document upload for an
// absence/undertime/overtime deviation.
// Connects to: POST /api/students/[studentProfileId]/deviations (Task 10
// route) → `attendanceService.submitDeviationReport` (Task 3), body
// validated by `deviationReportSchema` (`src/lib/validators/attendance.ts`,
// Task 2) — needs `date`, `deviationType` (`DeviationType` enum:
// ABSENCE/OVERTIME/UNDERTIME), `reason`, optional `proofUrl`.
// Edge cases: none beyond standard form validation.
export function DeviationReportForm({ studentProfileId }: { studentProfileId: string }) {
  return (
    <div data-testid="deviation-report-form" className="text-sm text-muted-foreground">
      Deviation report form for {studentProfileId} — not yet implemented (see issue #42).
    </div>
  );
}
