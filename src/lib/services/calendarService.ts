// Unified calendar aggregation across roles. See PRD Module 12 (FR-CAL-*).
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeProjectedCompletionDate } from "@/lib/services/attendanceService";

export type CalendarEventType = "DEADLINE" | "HOLIDAY" | "DEVIATION" | "COMPLETION";

export interface CalendarEvent {
  type: CalendarEventType;
  date: Date;
  label: string;
  studentProfileId?: string;
  color?: string;
}

// FR-CAL-01 — Owner: JayPing23 (Danielle)
// Requirement: all roles have access to a calendar view displaying
// color-coded events: Submission Deadlines (Red), Holidays (Gray), Approved
// Deviations (Yellow), and Projected OJT Completion Date (Green milestone).
// This is the central aggregator every other function in this file specializes.
// Connects to: called by GET /api/calendar (Task 13 route). Pulls: weekly
// report deadlines from `weeklyReportService.listWeeklyReportsForStudent`
// (Task 4); `HolidayCalendarEntry` rows from
// `attendanceService.getHolidayCalendarForStudent` (Task 3); `DeviationReport`
// rows with `validationStatus === VALIDATED`; and
// `attendanceService.computeProjectedCompletionDate` (Task 3) — into one
// normalized `CalendarEvent[]`, scoped by `role`: STUDENT_INTERN sees own
// data only; FACULTY_ADVISER sees assigned students via
// `FacultyClassGroup`; DEPARTMENT_COORDINATOR/SUPER_ADMIN see the whole
// department.
// Edge cases: role-scoping bugs here are a data-leak risk — a student must
// never see another student's events, so this needs the same rigor as
// `assertCanAccessStudent`, even though it's a read, not a mutation.
export async function getUnifiedCalendarEvents(
  userId: string,
  role: Role
): Promise<CalendarEvent[]> {
  // TODO(JayPing23): implement per the contract above.
  void userId;
  void role;
  return [];
}

// FR-CAL-01 — Owner: AndresBonifaci0 (Matt)
// Requirement: color-code events per the scheme above.
// Connects to: called by GET /api/calendar (Task 13 route) right after
// `getUnifiedCalendarEvents` above, and by `calendar/page.tsx` (Task 17) if
// the route ever needs to re-color a client-side-filtered subset. Pure
// function — sets `CalendarEvent.color`: DEADLINE=red, HOLIDAY=gray,
// DEVIATION=yellow, COMPLETION=green.
// Edge cases: none — no I/O, just a `type → color` map.
export function colorCodeCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  // TODO(AndresBonifaci0): implement per the contract above.
  return events;
}

// FR-CAL-02 — Owner: gu457 (Ulrich)
// Requirement: the student calendar displays the student's specific work
// schedule, upcoming report deadlines, and a prominent, auto-updating
// Projected OJT Completion Date.
// Connects to: consumed by `UnifiedCalendarView` (F5, `calendar/page.tsx`,
// Task 17) when the viewer is a STUDENT_INTERN. Thin wrapper around
// `getUnifiedCalendarEvents` above scoped to one student, layered with
// their `WorkPlan.scheduleConfig` (`attendanceService.ts`, Task 3).
// Edge cases: none beyond what `getUnifiedCalendarEvents` already handles.
export async function getStudentCalendarView(studentProfileId: string): Promise<CalendarEvent[]> {
  // TODO(gu457): implement per the contract above.
  void studentProfileId;
  return [];
}

// FR-CAL-03 — Owner: AndresBonifaci0 (Matt)
// Requirement: the faculty calendar displays aggregated submission
// deadlines for all assigned students, highlighting weeks with high
// expected submission volumes.
// Connects to: consumed by `UnifiedCalendarView` (F5, Task 17) for
// FACULTY_ADVISER viewers. Calls `getUnifiedCalendarEvents` above once per
// student assigned via `FacultyClassGroup` (`faculty_class_groups` table,
// same join Phase 2's `my-students` page already uses) and merges into one
// aggregated array. Feeds `detectHighVolumeSubmissionWeeks` below.
// Edge cases: none beyond the aggregation itself.
export async function getFacultyCalendarView(facultyId: string): Promise<CalendarEvent[]> {
  // TODO(AndresBonifaci0): implement per the contract above.
  void facultyId;
  return [];
}

// FR-CAL-03 — Owner: AndresBonifaci0 (Matt)
// Requirement: highlight weeks with high expected submission volumes.
// Connects to: reads `getFacultyCalendarView`'s output above (call it
// directly, don't re-derive). Buckets DEADLINE-type events by week, flags
// weeks exceeding a configurable threshold (mirror
// `attendanceService.getRequiredHoursConfig`'s `SystemConfig`-lookup
// pattern for the threshold value, or hardcode a documented default —
// implementer's call).
// Edge cases: none.
export async function detectHighVolumeSubmissionWeeks(
  facultyId: string
): Promise<{ weekStart: Date; count: number }[]> {
  // TODO(AndresBonifaci0): implement per the contract above.
  void facultyId;
  return [];
}

// FR-CAL-04 — Owner: AndresBonifaci0 (Matt)
// Requirement: the coordinator calendar displays department-wide
// milestones, MOA expiration dates, and clustered projected completion
// dates to anticipate endorsement letter generation spikes.
// Connects to: consumed by `UnifiedCalendarView` (F5, Task 17) for
// DEPARTMENT_COORDINATOR/SUPER_ADMIN viewers. Merges
// `getUnifiedCalendarEvents`-style events department-wide with
// `companyService.getExpiringMoaRecords` (Phase 2, already exists — reuse
// it, don't re-derive MOA-expiry logic). Feeds
// `detectEndorsementLetterSpikes` below.
// Edge cases: none beyond the merge.
export async function getCoordinatorCalendarView(coordinatorId: string): Promise<CalendarEvent[]> {
  // TODO(AndresBonifaci0): implement per the contract above.
  void coordinatorId;
  return [];
}

// FR-CAL-04 — Owner: JayPing23 (Danielle)
// Requirement: anticipate endorsement letter generation spikes.
// Connects to: reads `getCoordinatorCalendarView`'s COMPLETION-type events
// above (equivalently, calls `attendanceService.computeProjectedCompletionDate`,
// Task 3, per student in the department) and clusters them by week/month to
// flag upcoming load spikes — same "bucket by week, flag over threshold"
// shape as `detectHighVolumeSubmissionWeeks` above, different event type.
// Edge cases: none.
// All internship students/schedules are Philippines-based (see PRD Module
// 5's Philippine holiday-calendar requirement, FR-AT-02), but this runs on
// servers/CI in UTC — plain `getUTCDay()`/date-component reads on a raw UTC
// timestamp can be up to one calendar day behind Manila between 00:00-07:59
// local time, so week-boundary math is done after shifting to UTC+8 first.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

// Returns the UTC instant corresponding to 00:00 Manila-local time on the
// Monday of the week containing `date` — a stable per-week bucket key
// independent of `date`'s time-of-day component.
function getManilaWeekStart(date: Date): Date {
  const manila = new Date(date.getTime() + MANILA_OFFSET_MS);
  const manilaDayOfWeek = manila.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (manilaDayOfWeek + 6) % 7; // 0=Mon..6=Sun
  const manilaMidnight = Date.UTC(
    manila.getUTCFullYear(),
    manila.getUTCMonth(),
    manila.getUTCDate()
  );
  return new Date(manilaMidnight - daysSinceMonday * 24 * 60 * 60 * 1000 - MANILA_OFFSET_MS);
}

// No SystemConfig-lookup precedent exists yet for this kind of threshold
// (getRequiredHoursConfig, the pattern this contract points at, is itself
// still a stub) — hardcoded documented default per the "implementer's
// call" allowance this contract shares with `detectHighVolumeSubmissionWeeks`
// above. Revisit if/when a coordinator-configurable threshold is needed.
const ENDORSEMENT_SPIKE_THRESHOLD = 3;

export async function detectEndorsementLetterSpikes(
  coordinatorId: string
): Promise<{ weekStart: Date; expectedCount: number }[]> {
  // The schema has no Department model — this system serves a single
  // department (SLU SAMCIS) — so there is no per-coordinator filter to
  // apply; every active student's projected completion date is in scope.
  void coordinatorId;

  const students = await prisma.studentProfile.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const completionDates = await Promise.all(
    students.map((student) => computeProjectedCompletionDate(student.id))
  );

  const buckets = new Map<number, { weekStart: Date; expectedCount: number }>();
  for (const completionDate of completionDates) {
    if (!completionDate) continue;

    const weekStart = getManilaWeekStart(completionDate);
    const key = weekStart.getTime();
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.expectedCount += 1;
    } else {
      buckets.set(key, { weekStart, expectedCount: 1 });
    }
  }

  return Array.from(buckets.values())
    .filter((bucket) => bucket.expectedCount >= ENDORSEMENT_SPIKE_THRESHOLD)
    .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
}
