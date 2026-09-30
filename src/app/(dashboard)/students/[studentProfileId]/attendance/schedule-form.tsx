"use client";

import { CalendarCog } from "lucide-react";

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
    <div
      data-testid="attendance-schedule-form"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground"
    >
      <CalendarCog className="size-6 text-muted-foreground" aria-hidden="true" />
      <p>Schedule form for {studentProfileId} — not yet implemented (see issue #41).</p>
    </div>
  );
}
