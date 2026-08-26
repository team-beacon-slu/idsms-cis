"use client";

// FR-AT-01, FR-AT-08 — Owner: gu457 (Ulrich)
// Requirement: initial schedule config form, plus a mid-internship
// change-request form (same component, two modes).
// Connects to: POST /api/students/[studentProfileId]/schedule (Task 9
// route) → `attendanceService.configureWorkSchedule` (Task 3) for initial
// setup; PATCH same route → `requestScheduleChange` (Task 3) for a change
// request, body validated by `scheduleChangeRequestSchema`
// (`src/lib/validators/attendance.ts`, Task 2) — needs `reason` (string)
// and `newScheduleConfig` (`{ daysOfWeek: number[], hoursPerDay: number }`),
// plus an optional file upload for the supporting document.
// Follow the Phase 2 `checklist-item-row.tsx` pattern exactly (fetch +
// `sonner` toast + `router.refresh()`) — that file is the reference
// implementation for this kind of client component in this codebase.
// Edge cases: none beyond standard form validation.
export function AttendanceScheduleForm({ studentProfileId }: { studentProfileId: string }) {
  return (
    <div data-testid="attendance-schedule-form" className="text-sm text-muted-foreground">
      Schedule form for {studentProfileId} — not yet implemented (see issue #41).
    </div>
  );
}
