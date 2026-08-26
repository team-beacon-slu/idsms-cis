// Attendance & schedule configuration, deviation reports, hour computation,
// mid-internship schedule changes. See PRD Module 5 (FR-AT-*).
import {
  DeviationType,
  Prisma,
  PrismaClient,
  Program,
  Role,
  ValidationStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent } from "@/lib/services/userService";

// `logEvent` from "@/lib/services/auditService" is intentionally not
// imported yet — no stub body below calls it (they're all placeholders).
// Import it when implementing the real logic behind any mutation stub; an
// unused import fails this project's ESLint no-unused-vars rule.

export interface ConfigureWorkScheduleInput {
  daysOfWeek: number[]; // 0=Sunday..6=Saturday
  hoursPerDay: number;
}

// FR-AT-01 — Owner: KennethRusselAvaricio
// Requirement: upon work plan approval, each student configures their work
// schedule (daily hours, working days).
// Connects to: called by POST /api/students/[studentProfileId]/schedule
// (Task 9 route). Writes `WorkPlan.scheduleConfig` (Json field on the
// `work_plans` table, prisma.workPlan.update inside a $transaction) — read
// `WorkPlan.status` (WorkPlanStatus enum) first. Log via
// `logEvent({ action: "SCHEDULE_CONFIGURED", entityType: "WorkPlan", ... })`
// from auditService.ts.
// Edge cases: no WorkPlan with status APPROVED exists yet for this student
// (throw, don't silently no-op); scheduleConfig already set (decide
// overwrite vs. reject — FR-AT-01 doesn't specify, this is a call for the
// implementer to make and document).
export async function configureWorkSchedule(
  studentProfileId: string,
  input: ConfigureWorkScheduleInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ studentProfileId: string; scheduleConfig: ConfigureWorkScheduleInput }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void ipAddress;
  return { studentProfileId, scheduleConfig: input };
}

export interface HolidayCalendarEntryDTO {
  id: string;
  date: Date;
  name: string;
  applicable: boolean;
}

// FR-AT-02 — Owner: 2215428-sys (Gillian)
// Requirement: populate a calendar-based schedule pre-populated with
// Philippine national/regional holidays and company-specific non-working
// days that students can mark as applicable.
// Connects to: reads `HolidayCalendarEntry` (`holiday_calendar` table) two
// ways — rows with `semesterId` set and `studentProfileId` null are
// system-wide (national/regional); rows with `studentProfileId` set are the
// per-student override `markHolidayApplicable` below writes, reachable via
// `StudentProfile.holidayOverrides`. Consumed by
// `weeklyReportService.generateWeeklyReportForm` (Task 4, to skip
// non-working days) and by `attendance/page.tsx` (Task 14).
// Edge cases: SCHEMA GAP found while scaffolding — `HolidayCalendarEntry`
// has no boolean "applicable" field. There's no company-specific
// non-working-day source in the schema either (`Company` has no such
// field). Implementer must decide: does a per-student override row mean
// "this holiday doesn't apply to me" (row = opt-out) or "this is an extra
// non-working day for me" (row = opt-in)? Whichever is chosen must be
// documented in this JSDoc and reflected in `markHolidayApplicable` below —
// don't add a new schema field without raising it with Danielle first
// (`ScheduleId`-style vestige risk).
export async function getHolidayCalendarForStudent(
  studentProfileId: string
): Promise<HolidayCalendarEntryDTO[]> {
  // TODO(2215428-sys): implement per the contract above.
  void studentProfileId;
  return [];
}

// FR-AT-02 — Owner: 2215428-sys (Gillian)
// Requirement: students can mark a pre-populated holiday as applicable/not
// applicable to their own schedule.
// Connects to: writes the same `HolidayCalendarEntry` rows
// `getHolidayCalendarForStudent` above reads (via
// `StudentProfile.holidayOverrides`) — whatever override representation is
// chosen there must match here exactly (create/delete/update a row with
// `studentProfileId` set to this student).
// Edge cases: same schema-gap note as `getHolidayCalendarForStudent` — this
// function's implementation is coupled to that decision.
export async function markHolidayApplicable(
  studentProfileId: string,
  holidayEntryId: string,
  applicable: boolean,
  actingUser: { id: string; role: Role }
): Promise<{ holidayEntryId: string; applicable: boolean }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(2215428-sys): implement per the contract above.
  return { holidayEntryId, applicable };
}

export interface SubmitDeviationReportInput {
  date: Date;
  deviationType: DeviationType;
  reason: string;
  proofUrl?: string;
}

// FR-AT-03 — Owner: KennethRusselAvaricio
// Requirement: absences/undertime/overtime submitted via a structured
// deviation report form with date, reason category, and optional proof upload.
// Connects to: called by POST /api/students/[studentProfileId]/deviations
// (Task 10 route, which also handles the file upload via
// `src/lib/storage.ts`'s `uploadFile`, Phase 2 pattern, before calling this).
// Creates a `DeviationReport` row (`deviation_reports` table) — fields
// `date`, `deviationType` (`DeviationType` enum: ABSENCE/OVERTIME/UNDERTIME),
// `reason`, `proofUrl`, `validationStatus` (start `PENDING`). Log via
// `logEvent({ action: "DEVIATION_SUBMITTED", entityType: "DeviationReport" })`.
// Edge cases: none beyond the standard $transaction + logEvent pattern.
export async function submitDeviationReport(
  studentProfileId: string,
  input: SubmitDeviationReportInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ id: string; validationStatus: ValidationStatus }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void input;
  void ipAddress;
  return { id: "", validationStatus: ValidationStatus.PENDING };
}

// Trivial read — not a stub, matches Phase 2's listCompanies precedent.
export async function listDeviationReportsForStudent(studentProfileId: string) {
  return prisma.deviationReport.findMany({
    where: { studentProfileId },
    orderBy: { date: "desc" },
  });
}

// Trivial read — not a stub. Resolves the owning student for a
// DeviationReport id, same reason and same pattern as
// `getWorkPlanStudentProfileId` below: a `deviationReportId` alone carries
// no ownership information, so PATCH /api/deviations/[id]/validate
// (Task 10) must call this before `assertCanAccessStudent`.
export async function getDeviationReportStudentProfileId(
  deviationReportId: string
): Promise<string> {
  const deviationReport = await prisma.deviationReport.findUniqueOrThrow({
    where: { id: deviationReportId },
    select: { studentProfileId: true },
  });
  return deviationReport.studentProfileId;
}

// FR-AT-04 — Owner: KennethRusselAvaricio
// Requirement: all deviation reports must be validated by the faculty
// adviser before affecting hour computation.
// Connects to: called by PATCH /api/deviations/[id]/validate (Task 10
// route, Faculty/Coordinator/Admin-gated). Sets
// `DeviationReport.validationStatus` (`ValidationStatus` enum:
// PENDING/VALIDATED/REJECTED — note it is VALIDATED, not APPROVED) and
// `DeviationReport.facultyId`. Downstream: `computeTotalHoursRendered`
// below must filter on `validationStatus === VALIDATED` only.
// Edge cases: a REJECTED row must never be readable by
// `computeTotalHoursRendered` — this is the whole point of the gate.
export async function validateDeviationReport(
  deviationReportId: string,
  facultyId: string,
  action: "VALIDATE" | "REJECT",
  ipAddress?: string | null
): Promise<{ id: string; validationStatus: ValidationStatus }> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void facultyId;
  void action;
  void ipAddress;
  return { id: deviationReportId, validationStatus: ValidationStatus.PENDING };
}

// FR-AT-05 — Owner: JayPing23 (Danielle)
// Requirement: automatically compute total hours rendered, based only on
// validated attendance data. This is the system's central value metric —
// every other module's "hours" display reads from this.
// Connects to: reads `DailyReportEntry.actualHours` (via `WeeklyReport`,
// only rows with `WeeklyReportStatus` APPROVED or REGARDED — see
// `weeklyReportService.ts`'s review actions, Task 4) plus `DeviationReport`
// rows with `validationStatus === VALIDATED` (`deviationType` OVERTIME
// adds, ABSENCE/UNDERTIME subtract — see `validateDeviationReport` above).
// Writes the result to `StudentProfile.renderedHours` (Decimal field,
// currently unwritten anywhere in the codebase — confirmed via
// `grep -rn renderedHours src/` during spec research). Called by GET
// /api/students/[studentProfileId]/attendance-summary (Task 11) and by
// `reviewWeeklyReport_Approve`/`_Regard` (Task 4) after each approval.
// Edge cases: must never read PENDING/RETURNED/DISREGARDED WeeklyReport
// rows, or PENDING/REJECTED DeviationReport rows.
export async function computeTotalHoursRendered(studentProfileId: string): Promise<number> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  return 0;
}

// FR-AT-05 — Owner: JayPing23 (Danielle)
// Requirement: automatically compute required hours remaining and a
// projected completion date, based only on validated attendance data.
// Connects to: calls `computeTotalHoursRendered` above; reads
// `StudentProfile.requiredHours` (Int) and the active schedule from
// `WorkPlan.scheduleConfig` (post any `applyScheduleChangeProspectively`
// change further down this file). Called by the same attendance-summary
// route (Task 11) and by `calendarService.detectEndorsementLetterSpikes`
// (Task 7, which clusters these dates across students).
// Edge cases: return null when no APPROVED WorkPlan/schedule exists yet —
// there's nothing to project against.
export async function computeProjectedCompletionDate(
  studentProfileId: string
): Promise<Date | null> {
  // TODO(JayPing23): implement per the contract above.
  void studentProfileId;
  return null;
}

// `REQUIRED_HOURS_CONFIG_KEY` is intentionally not defined yet — no stub
// body below calls it (they're all placeholders); an unused top-level
// const fails ESLint no-unused-vars the same way the removed `logEvent`
// import did. Define it as `(program: Program) => \`required_hours:${program}\``
// when implementing the real logic behind `getRequiredHoursConfig` or
// `setRequiredHoursConfig` below — both should share the same key builder.

// FR-AT-06 — Owner: 2215428-sys (Gillian)
// Requirement: required completion hours per program must be configurable
// via the admin interface, never hardcoded.
// Connects to: called by GET /api/config/required-hours (Task 11). Reads
// `SystemConfig.configValue` (Json) where `configKey === REQUIRED_HOURS_CONFIG_KEY(program)`
// (`system_config` table, unique on `configKey`).
// Edge cases: fall back to a documented default only if unset — don't throw.
export async function getRequiredHoursConfig(program: Program): Promise<number> {
  // TODO(2215428-sys): implement per the contract above.
  void program;
  return 0;
}

// FR-AT-06 — Owner: 2215428-sys (Gillian)
// Requirement: same as above, the write side.
// Connects to: called by PATCH /api/config/required-hours (Task 11,
// Super Admin only — enforced by the route's `requireRole`, this function
// trusts that gate the same way `companyService.updateCompany` does).
// Upserts `SystemConfig` at `REQUIRED_HOURS_CONFIG_KEY(program)`.
// Edge cases: must NOT retroactively alter already-provisioned
// `StudentProfile.requiredHours` values (those are set once, at bulk-import
// time, per Phase 1's `userService.bulkImportStudents`) — this only changes
// the default for *future* imports.
export async function setRequiredHoursConfig(
  program: Program,
  hours: number,
  actingUserId: string,
  ipAddress?: string | null
): Promise<{ program: Program; hours: number }> {
  // TODO(2215428-sys): implement per the contract above.
  void actingUserId;
  void ipAddress;
  return { program, hours };
}

// FR-AT-07 — Owner: Shantea23
// Requirement: students can export their attendance log as CSV.
// Connects to: called by GET /api/students/[studentProfileId]/attendance-export
// (Task 11 route, which sets the CSV response headers — this function only
// returns the CSV body as a string). Reads `DailyReportEntry` rows (via
// this student's `WeeklyReport`s) for `reportDate`, `scheduledHours`,
// `actualHours`, `attendanceStatus`.
// Edge cases: none — read-only formatting.
export async function exportAttendanceLogCsv(studentProfileId: string): Promise<string> {
  // TODO(Shantea23): implement per the contract above.
  void studentProfileId;
  return "date,scheduledHours,actualHours,status\n";
}

export interface RequestScheduleChangeInput {
  reason: string;
  newScheduleConfig: ConfigureWorkScheduleInput;
  supportingDocumentPath?: string;
}

// Trivial read — not a stub. Resolves the owning student for a WorkPlan id
// so routes that only receive `workPlanId` (the two schedule-change review
// routes below, Task 9) can call `assertCanAccessStudent` before acting —
// same pre-flight fix as Task 12's `weeklyReportId`-only routes. Throws if
// the WorkPlan doesn't exist, matching `findUniqueOrThrow`'s use elsewhere
// in this codebase (see `companyService.updateMoaRecordStatus`).
export async function getWorkPlanStudentProfileId(workPlanId: string): Promise<string> {
  const workPlan = await prisma.workPlan.findUniqueOrThrow({
    where: { id: workPlanId },
    select: { studentProfileId: true },
  });
  return workPlan.studentProfileId;
}

// FR-AT-08 — Owner: Rhaastas (org invite pending — GitHub issue #13
// created unassigned; assign once they accept)
// Requirement: students may request a mid-internship schedule change via a
// structured form, requiring a valid reason and supporting document if applicable.
// Connects to: called by PATCH /api/students/[studentProfileId]/schedule
// (Task 9 route). Must call `logScheduleChangeHistory` (bottom of this
// file) to append a `{ status: "PENDING_FACULTY" }` entry to this
// student's latest `WorkPlan.scheduleChangeHistory` (Json array). The
// resulting pending request is picked up next by
// `validateScheduleChangeFaculty` below.
// Edge cases: if a supporting document was uploaded, the route has already
// called `uploadFile` (Phase 2 `storage.ts` pattern) and passed the
// resulting path in `input.supportingDocumentPath`.
export async function requestScheduleChange(
  studentProfileId: string,
  input: RequestScheduleChangeInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: "PENDING_FACULTY" }> {
  await assertCanAccessStudent(actingUser, studentProfileId);
  // TODO(Rhaastas): implement per the contract above.
  void input;
  void ipAddress;
  return { workPlanId: "", status: "PENDING_FACULTY" };
}

// FR-AT-09 (step 1 of 2) — Owner: JayPing23 (Danielle)
// Requirement: schedule changes require Faculty Adviser validation followed
// by Department Coordinator final approval — this is step 1.
// Connects to: called by PATCH
// /api/work-plans/[id]/schedule-change/faculty-review (Task 9 route,
// Faculty-only). On APPROVE, advances the pending request (written by
// `requestScheduleChange` above) to `PENDING_COORDINATOR`, for
// `approveScheduleChangeCoordinator` below to pick up. On REJECT, the
// request is terminal — no further action. Log via
// `logScheduleChangeHistory`.
// Edge cases: must only act on a request currently `PENDING_FACULTY` —
// reject/throw if called on a request in any other state.
export async function validateScheduleChangeFaculty(
  workPlanId: string,
  facultyId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  // TODO(JayPing23): implement per the contract above.
  void facultyId;
  void action;
  void ipAddress;
  return { workPlanId, status: "PENDING_FACULTY" };
}

// FR-AT-09 (step 2 of 2) — Owner: JayPing23 (Danielle)
// Requirement: step 2 — Department Coordinator final approval.
// Connects to: called by PATCH
// /api/work-plans/[id]/schedule-change/coordinator-review (Task 9 route,
// Coordinator/Admin-only). Only callable once
// `validateScheduleChangeFaculty` above set status `PENDING_COORDINATOR`.
// On final APPROVE, calls `applyScheduleChangeProspectively` below. Log via
// `logScheduleChangeHistory`.
// Edge cases: reject/throw if called on a request not currently
// `PENDING_COORDINATOR`.
export async function approveScheduleChangeCoordinator(
  workPlanId: string,
  coordinatorId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  // TODO(JayPing23): implement per the contract above.
  void coordinatorId;
  void action;
  void ipAddress;
  return { workPlanId, status: "PENDING_COORDINATOR" };
}

// FR-AT-10 — Owner: JayPing23 (Danielle)
// Requirement: approved schedule changes do NOT retroactively alter
// previously validated hours or reports — they only affect future hour
// computation and update the projected completion date.
// Connects to: called internally by `approveScheduleChangeCoordinator`
// above (not its own route). Swaps the active `WorkPlan.scheduleConfig` for
// future-dated computation only. Must trigger
// `computeProjectedCompletionDate` (above) to recompute after applying.
// Edge cases: must NOT touch any already-computed `WeeklyReport` or
// `DailyReportEntry` row — this is the "prospective, not retroactive" rule
// FR-AT-10 exists to enforce.
export async function applyScheduleChangeProspectively(
  workPlanId: string
): Promise<{ workPlanId: string; effectiveFrom: Date }> {
  // TODO(JayPing23): implement per the contract above.
  return { workPlanId, effectiveFrom: new Date() };
}

export interface ScheduleChangeHistoryEntry {
  timestamp: string;
  approverId: string | null;
  action: string;
  [key: string]: unknown;
}

// FR-AT-11 — Owner: KennethRusselAvaricio
// Requirement: all schedule changes are logged in
// `work_plans.scheduleChangeHistory` with timestamps and approver IDs.
// Connects to: called internally by `requestScheduleChange`,
// `validateScheduleChangeFaculty`, `approveScheduleChangeCoordinator`, and
// `applyScheduleChangeProspectively` (all above in this file) — never
// exposed as its own route. Appends `entry` to `WorkPlan.scheduleChangeHistory`
// (Json array, `@default("[]")`).
// Edge cases: none — pure append, no read-modify-write race handling needed
// beyond what `$transaction` already gives every other mutation in this file.
export async function logScheduleChangeHistory(
  workPlanId: string,
  entry: ScheduleChangeHistoryEntry,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<void> {
  // TODO(KennethRusselAvaricio): implement per the contract above.
  void workPlanId;
  void entry;
  void client;
  return;
}
