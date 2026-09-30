"use client";

import { ClipboardList } from "lucide-react";

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
    <div
      data-testid="deviation-report-form"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground"
    >
      <ClipboardList className="size-6 text-muted-foreground" aria-hidden="true" />
      <p>Deviation report form for {studentProfileId} — not yet implemented (see issue #42).</p>
    </div>
  );
}
