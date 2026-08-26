"use client";

import { Button } from "@/components/ui/button";

// FR-AT-07 — Owner: AndresBonifaci0 (Matt)
// Requirement: students can export their attendance log as CSV.
// Connects to: GET /api/students/[studentProfileId]/attendance-export
// (Task 11 route) → `attendanceService.exportAttendanceLogCsv` (Task 3).
// The route already sets `Content-Disposition: attachment` — this button
// just needs to trigger the browser download (`window.open` or an anchor
// click, not `fetch` + manual blob handling, unless auth requires it).
// Edge cases: none.
export function AttendanceExportButton({ studentProfileId }: { studentProfileId: string }) {
  void studentProfileId;
  return (
    <Button size="sm" variant="outline" disabled data-testid="attendance-export-button">
      Export CSV (not yet implemented — see issue #44)
    </Button>
  );
}
