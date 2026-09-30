// Unified calendar aggregation across roles. See PRD Module 12 (FR-CAL-*).
import { Role, ValidationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeProjectedCompletionDate,
  getHolidayCalendarForStudent,
} from "@/lib/services/attendanceService";
import { listWeeklyReportsForStudent } from "@/lib/services/weeklyReportService";

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
// SCHEMA GAP (documented, not fixed here): `WeeklyReport` has no explicit
// deadline field. FR-WR-05 fixes submission day at Tuesday, so the DEADLINE
// event date is derived as the first Tuesday strictly after `weekEnd` —
// same "note the interpretation instead of adding an unreviewed field" rule
// `getHolidayCalendarForStudent` (attendanceService.ts) already follows for
// its own gap.
const TUESDAY_UTC_DAY = 2;
function weeklyReportDeadline(weekEnd: Date): Date {
  const daysUntilTuesday = (TUESDAY_UTC_DAY - weekEnd.getUTCDay() + 7) % 7 || 7;
  return new Date(weekEnd.getTime() + daysUntilTuesday * 24 * 60 * 60 * 1000);
}

// Resolves which students' events `userId`/`role` may see. Mirrors
// `assertCanAccessStudent`'s (userService.ts) per-role rule exactly, but
// returns a student-id set instead of asserting against one known id —
// this is a read with no single target to assert against, but a leaked
// student id here is the same class of data-leak bug that function exists
// to prevent, so it gets the same rigor.
async function resolveVisibleStudentProfileIds(userId: string, role: Role): Promise<string[]> {
  if (role === Role.STUDENT_INTERN) {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile ? [profile.id] : [];
  }

  if (role === Role.FACULTY_ADVISER) {
    const classGroups = await prisma.facultyClassGroup.findMany({
      where: { facultyId: userId },
      select: { classGroupId: true, semesterId: true },
    });
    // Same "an empty OR: [] is not a safe no-op filter" rule as
    // my-students/page.tsx — zero assigned groups must mean zero students.
    if (classGroups.length === 0) {
      return [];
    }
    const students = await prisma.studentProfile.findMany({
      where: {
        deletedAt: null,
        OR: classGroups.map((g) => ({ classGroupId: g.classGroupId, semesterId: g.semesterId })),
      },
      select: { id: true },
    });
    return students.map((s) => s.id);
  }

  // DEPARTMENT_COORDINATOR / SUPER_ADMIN see the whole department. The
  // schema has no Department model — this system serves a single
  // department (SLU SAMCIS) — so "department-wide" means every
  // non-deleted student record.
  const students = await prisma.studentProfile.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  return students.map((s) => s.id);
}

async function getStudentCalendarEvents(studentProfileId: string): Promise<CalendarEvent[]> {
  const [weeklyReports, holidays, deviations, completionDate] = await Promise.all([
    listWeeklyReportsForStudent(studentProfileId),
    getHolidayCalendarForStudent(studentProfileId),
    prisma.deviationReport.findMany({
      where: { studentProfileId, validationStatus: ValidationStatus.VALIDATED },
    }),
    computeProjectedCompletionDate(studentProfileId),
  ]);

  const events: CalendarEvent[] = [];

  for (const report of weeklyReports) {
    events.push({
      type: "DEADLINE",
      date: weeklyReportDeadline(report.weekEnd),
      label: `Weekly report due — week of ${report.weekStart.toISOString().slice(0, 10)}`,
      studentProfileId,
    });
  }

  // Only holidays this student hasn't opted out of apply to their schedule
  // — see `getHolidayCalendarForStudent`'s own schema-gap note for what
  // `applicable` means.
  for (const holiday of holidays) {
    if (!holiday.applicable) continue;
    events.push({ type: "HOLIDAY", date: holiday.date, label: holiday.name, studentProfileId });
  }

  for (const deviation of deviations) {
    events.push({
      type: "DEVIATION",
      date: deviation.date,
      label: `${deviation.deviationType} — ${deviation.reason}`,
      studentProfileId,
    });
  }

  if (completionDate) {
    events.push({
      type: "COMPLETION",
      date: completionDate,
      label: "Projected OJT Completion Date",
      studentProfileId,
    });
  }

  return events;
}

export async function getUnifiedCalendarEvents(
  userId: string,
  role: Role
): Promise<CalendarEvent[]> {
  const studentProfileIds = await resolveVisibleStudentProfileIds(userId, role);
  const perStudentEvents = await Promise.all(
    studentProfileIds.map((studentProfileId) => getStudentCalendarEvents(studentProfileId))
  );
  return perStudentEvents.flat();
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
