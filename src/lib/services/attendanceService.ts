// Attendance & schedule configuration, deviation reports, hour computation,
// mid-internship schedule changes. See PRD Module 5 (FR-AT-*).
import {
  DeviationType,
  Prisma,
  PrismaClient,
  Program,
  Role,
  ValidationStatus,
  WeeklyReportStatus,
  WorkPlanStatus,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/workPlanService";
import { requiredHoursConfigSchema } from "@/lib/validators/attendance";

export interface ConfigureWorkScheduleInput {
  daysOfWeek: number[]; // 0=Sunday..6=Saturday
  hoursPerDay: number;
  startTime?: string; // "HH:MM" Manila, shift start
  endTime?: string;
  breakMinutes?: number;
}

// De-duplicates and sorts the days; shift keys are kept only when set so
// legacy schedules keep their two-key shape.
function normalizeSchedule(input: ConfigureWorkScheduleInput): ConfigureWorkScheduleInput {
  return {
    daysOfWeek: Array.from(new Set(input.daysOfWeek)).sort((a, b) => a - b),
    hoursPerDay: input.hoursPerDay,
    ...(input.startTime ? { startTime: input.startTime } : {}),
    ...(input.endTime ? { endTime: input.endTime } : {}),
    ...(input.breakMinutes != null ? { breakMinutes: input.breakMinutes } : {}),
  };
}

// Thrown by the schedule functions below when the student has no APPROVED
// work plan yet — FR-AT-01 only lets a schedule be configured "upon work
// plan approval", so there is nothing to attach a schedule to.
export class WorkPlanNotApprovedError extends Error {
  constructor(message = "Your work plan must be approved before you can set a schedule") {
    super(message);
    this.name = "WorkPlanNotApprovedError";
  }
}

export class ScheduleAlreadyConfiguredError extends Error {
  constructor(
    message = "Your schedule is already set — submit a schedule change request to modify it"
  ) {
    super(message);
    this.name = "ScheduleAlreadyConfiguredError";
  }
}

export class ScheduleNotConfiguredError extends Error {
  constructor(message = "Set up your work schedule on the Attendance page first") {
    super(message);
    this.name = "ScheduleNotConfiguredError";
  }
}

export class ScheduleChangePendingError extends Error {
  constructor(message = "You already have a schedule change request awaiting review") {
    super(message);
    this.name = "ScheduleChangePendingError";
  }
}

const PENDING_SCHEDULE_CHANGE_STATUSES = new Set(["PENDING_FACULTY", "PENDING_COORDINATOR"]);

// Latest status recorded in a WorkPlan's scheduleChangeHistory, or undefined
// when no change has ever been requested. Shared by the request intake
// below and by the attendance page's "pending request" banner.
export function getLatestScheduleChangeStatus(scheduleChangeHistory: unknown): string | undefined {
  const history = (scheduleChangeHistory ?? []) as ScheduleChangeHistoryEntry[];
  const last = history[history.length - 1];
  return typeof last?.status === "string" ? last.status : undefined;
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
// Decision: REJECT. Once a schedule exists, hours and projections are
// computed against it; letting the initial-setup path overwrite it would
// bypass FR-AT-08/09's two-step approval and FR-AT-10's "prospective only"
// rule. Any later change goes through `requestScheduleChange` below.
export async function configureWorkSchedule(
  studentProfileId: string,
  input: ConfigureWorkScheduleInput,
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<{ studentProfileId: string; scheduleConfig: ConfigureWorkScheduleInput }> {
  await assertCanAccessStudent(actingUser, studentProfileId);

  const scheduleConfig = normalizeSchedule(input);

  return prisma.$transaction(async (tx) => {
    const workPlan = await tx.workPlan.findFirst({
      where: { studentProfileId, status: WorkPlanStatus.APPROVED },
      orderBy: { createdAt: "desc" },
    });
    if (!workPlan) {
      throw new WorkPlanNotApprovedError();
    }
    if (workPlan.scheduleConfig != null) {
      throw new ScheduleAlreadyConfiguredError();
    }

    await tx.workPlan.update({
      where: { id: workPlan.id },
      data: { scheduleConfig: scheduleConfig as unknown as Prisma.InputJsonValue },
    });

    await logEvent(
      {
        userId: actingUser.id,
        action: "SCHEDULE_CONFIGURED",
        entityType: "WorkPlan",
        entityId: workPlan.id,
        ipAddress,
        detail: scheduleConfig as unknown as Prisma.InputJsonValue,
      },
      tx
    );

    return { studentProfileId, scheduleConfig };
  });
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
//
// Decision: a per-student row is an OPT-OUT marker. It carries the same
// `date` as the system-wide holiday it overrides, `studentProfileId` set,
// and `semesterId` null — "this holiday does not apply to me" (e.g. the host
// company works through it). A system-wide holiday is `applicable` unless
// such a marker exists for its date. No schema change needed. Company-
// specific *extra* non-working days are not modelled yet (no source for them
// in the schema), so they stay out of scope here.
export async function getHolidayCalendarForStudent(
  studentProfileId: string
): Promise<HolidayCalendarEntryDTO[]> {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: { semesterId: true },
  });
  if (!studentProfile) {
    return [];
  }

  const [systemHolidays, optOuts] = await Promise.all([
    prisma.holidayCalendarEntry.findMany({
      where: { semesterId: studentProfile.semesterId, studentProfileId: null },
      orderBy: { date: "asc" },
    }),
    prisma.holidayCalendarEntry.findMany({
      where: { studentProfileId },
      select: { date: true },
    }),
  ]);

  const optedOutDates = new Set(optOuts.map((o) => o.date.getTime()));
  return systemHolidays.map((holiday) => ({
    id: holiday.id,
    date: holiday.date,
    name: holiday.name,
    applicable: !optedOutDates.has(holiday.date.getTime()),
  }));
}

export class HolidayNotFoundError extends Error {
  constructor(message = "Holiday not found for this student's semester") {
    super(message);
    this.name = "HolidayNotFoundError";
  }
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

  return prisma.$transaction(async (tx) => {
    const studentProfile = await tx.studentProfile.findUniqueOrThrow({
      where: { id: studentProfileId },
      select: { semesterId: true },
    });
    // Only a system-wide holiday in this student's own semester can be
    // toggled — never another student's opt-out row, never an arbitrary id.
    const holiday = await tx.holidayCalendarEntry.findFirst({
      where: { id: holidayEntryId, semesterId: studentProfile.semesterId, studentProfileId: null },
    });
    if (!holiday) {
      throw new HolidayNotFoundError();
    }

    // Always clear first so repeated toggles never stack duplicate markers.
    await tx.holidayCalendarEntry.deleteMany({ where: { studentProfileId, date: holiday.date } });
    if (!applicable) {
      await tx.holidayCalendarEntry.create({
        data: {
          date: holiday.date,
          name: holiday.name,
          holidayType: holiday.holidayType,
          semesterId: null,
          studentProfileId,
        },
      });
    }

    await logEvent(
      {
        userId: actingUser.id,
        action: applicable ? "HOLIDAY_MARKED_APPLICABLE" : "HOLIDAY_MARKED_NOT_APPLICABLE",
        entityType: "HolidayCalendarEntry",
        entityId: holiday.id,
      },
      tx
    );

    return { holidayEntryId, applicable };
  });
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

  return prisma.$transaction(async (tx) => {
    const deviationReport = await tx.deviationReport.create({
      data: {
        studentProfileId,
        date: input.date,
        deviationType: input.deviationType,
        reason: input.reason,
        proofUrl: input.proofUrl ?? null,
        validationStatus: ValidationStatus.PENDING,
      },
    });

    await logEvent(
      {
        userId: actingUser.id,
        action: "DEVIATION_SUBMITTED",
        entityType: "DeviationReport",
        entityId: deviationReport.id,
        ipAddress,
        detail: { deviationType: input.deviationType, date: input.date.toISOString() },
      },
      tx
    );

    return { id: deviationReport.id, validationStatus: deviationReport.validationStatus };
  });
}

// Storage object paths for student-uploaded attendance documents. No
// dedicated bucket was provisioned for Phase 3 (see
// prisma/migrations_manual/003_storage_buckets.sql), so these live in the
// existing private checklist bucket under their own prefix. Shared by the
// deviations and schedule routes so both build paths the same way.
export function buildAttendanceDocumentPath(
  kind: "deviations" | "schedule-changes",
  studentProfileId: string,
  fileName: string
): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "bin";
  return `${kind}/${studentProfileId}/${randomUUID()}.${extension}`;
}

// `proofUrl` holds either a Storage object path (uploaded through the
// deviations route) or, for rows written before uploads existed, an
// external link. Only the former needs a signed URL.
export function isStoragePath(value: string): boolean {
  return !/^https?:\/\//i.test(value);
}

export async function getDeviationReport(deviationReportId: string) {
  return prisma.deviationReport.findUniqueOrThrow({ where: { id: deviationReportId } });
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
  if (action !== "VALIDATE" && action !== "REJECT") {
    throw new Error("Invalid deviation review action");
  }
  const validationStatus =
    action === "VALIDATE" ? ValidationStatus.VALIDATED : ValidationStatus.REJECTED;

  return prisma.$transaction(async (tx) => {
    const result = await tx.deviationReport.update({
      where: { id: deviationReportId },
      data: { validationStatus, facultyId },
      select: { id: true, validationStatus: true },
    });
    await logEvent(
      {
        userId: facultyId,
        action: `DEVIATION_REPORT_${validationStatus}`,
        entityType: "DeviationReport",
        entityId: deviationReportId,
        ipAddress,
        detail: { validationStatus },
      },
      tx
    );
    return result;
  });
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
// SCHEMA GAP: `DeviationReport` has no hours-magnitude column (no
// `scheduledHours`/`actualHours`-style field — see the model in
// schema.prisma), so the literal "+overtime/-absence/undertime" delta this
// FR's issue text describes can't be applied numerically. Approved
// `DailyReportEntry.actualHours` already reflects what actually happened
// each day (an absence day nets 0 actualHours, an overtime day nets more
// than its scheduledHours), so summing it alone already captures validated
// deviations' real effect. Flagged for Danielle/PM follow-up rather than
// adding a new schema field unreviewed (same rule `getHolidayCalendarForStudent`
// above already calls out for its own schema gap).
//
// Exported (not module-private) so #9's `computeProjectedCompletionDate`
// can reuse the same sum without duplicating this query once that issue
// lands — see that function's own comment for why it can't just call this
// exported, persisting version directly.
export async function calculateRenderedHours(
  studentProfileId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma
): Promise<number> {
  const approvedWeeklyReports = await client.weeklyReport.findMany({
    where: {
      studentProfileId,
      status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
    },
    select: { dailyEntries: { select: { actualHours: true } } },
  });

  const totalHours = approvedWeeklyReports.reduce((sum, report) => {
    const dayHours = report.dailyEntries.reduce(
      (daySum, entry) => daySum + Number(entry.actualHours ?? 0),
      0
    );
    return sum + dayHours;
  }, 0);

  return Math.round(totalHours * 100) / 100;
}

// No `logEvent` call here on purpose: this contract (unlike the file's other
// mutation stubs) never says "Log via logEvent" — only "Writes the result to
// StudentProfile.renderedHours" — and this function is invoked on every GET
// /attendance-summary read, not just on staff actions. Audit-logging a
// system-triggered cache recompute on every page load would flood the
// (append-only, NFR-SEC-07/10) audit log with unattributed `userId: null`
// rows for something that isn't itself a reviewable action.
export async function computeTotalHoursRendered(studentProfileId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const renderedHours = await calculateRenderedHours(studentProfileId, tx);

    await tx.studentProfile.update({
      where: { id: studentProfileId },
      data: { renderedHours },
    });

    return renderedHours;
  });
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
  const workPlan = await getLatestApprovedWorkPlanForStudent(studentProfileId);
  const scheduleConfig = workPlan?.scheduleConfig as unknown as
    ConfigureWorkScheduleInput | null | undefined;

  if (!workPlan || !scheduleConfig?.daysOfWeek?.length || !scheduleConfig.hoursPerDay) {
    return null;
  }

  // Reuses #8's `calculateRenderedHours` (not the exported, persisting
  // `computeTotalHoursRendered`) so this function doesn't trigger a second,
  // redundant StudentProfile write on every GET /attendance-summary call —
  // that route already calls computeTotalHoursRendered directly alongside
  // this one.
  const [renderedHours, studentProfile] = await Promise.all([
    calculateRenderedHours(studentProfileId),
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentProfileId },
      select: { requiredHours: true },
    }),
  ]);

  const remainingHours = studentProfile.requiredHours - renderedHours;
  if (remainingHours <= 0) {
    return new Date();
  }

  // B14 (applyScheduleChangeProspectively, out of scope here) is what keeps
  // the latest APPROVED WorkPlan's scheduleConfig current for "today
  // onward" — reading it here is what makes this projection automatically
  // honor an approved schedule change without duplicating any
  // history-walking logic of its own.
  const workingDays = new Set(scheduleConfig.daysOfWeek);
  const daysNeeded = Math.ceil(remainingHours / scheduleConfig.hoursPerDay);

  let projected = new Date();
  let workingDaysCounted = 0;
  while (workingDaysCounted < daysNeeded) {
    projected = new Date(projected.getTime() + 24 * 60 * 60 * 1000);
    if (workingDays.has(getManilaDayOfWeek(projected))) {
      workingDaysCounted += 1;
    }
  }

  return projected;
}

// All internship students/schedules are Philippines-based (see the
// `getHolidayCalendarForStudent` comment above re: Philippine holidays), but
// this runs on servers/CI in UTC. `daysOfWeek` was configured against
// Manila-local weekdays, so day-of-week must be read after shifting to
// UTC+8 — plain `getUTCDay()` on a raw UTC timestamp is up to one calendar
// day behind Manila between 00:00-07:59 local time.
function getManilaDayOfWeek(date: Date): number {
  const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + MANILA_OFFSET_MS).getUTCDay();
}

const REQUIRED_HOURS_CONFIG_KEY = (program: Program) => `required_hours:${program}`;

// FR-AT-06 — Owner: 2215428-sys (Gillian)
// Requirement: required completion hours per program must be configurable
// via the admin interface, never hardcoded.
// Connects to: called by GET /api/config/required-hours (Task 11). Reads
// `SystemConfig.configValue` (Json) where `configKey` equals a
// program-specific key (see the key-builder note above)
// (`system_config` table, unique on `configKey`).
// Edge cases: fall back to a documented default only if unset — don't throw.
export async function getRequiredHoursConfig(program: Program): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: REQUIRED_HOURS_CONFIG_KEY(program) },
    select: { configValue: true },
  });
  // PRD section 1 defaults apply only until an administrator configures the program.
  const defaults: Record<Program, number> = { BSIT: 600, BSCS: 240, BMMA: 500 };
  if (!config) return defaults[program];
  const hours = config.configValue;
  if (typeof hours !== "number" || !Number.isSafeInteger(hours) || hours <= 0) {
    throw new Error(`Invalid required-hours configuration for ${program}`);
  }
  return hours;
}

// FR-AT-06 — Owner: 2215428-sys (Gillian)
// Requirement: same as above, the write side.
// Connects to: called by PATCH /api/config/required-hours (Task 11,
// Super Admin only — enforced by the route's `requireRole`, this function
// trusts that gate the same way `companyService.updateCompany` does).
// Upserts `SystemConfig` at a program-specific key (see the key-builder note above).
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
  const input = requiredHoursConfigSchema.parse({ program, hours });
  return prisma.$transaction(async (tx) => {
    const config = await tx.systemConfig.upsert({
      where: { configKey: REQUIRED_HOURS_CONFIG_KEY(input.program) },
      create: {
        configKey: REQUIRED_HOURS_CONFIG_KEY(input.program),
        configValue: input.hours,
        updatedBy: actingUserId,
      },
      update: { configValue: input.hours, updatedBy: actingUserId },
      select: { id: true },
    });
    await logEvent(
      {
        userId: actingUserId,
        action: "REQUIRED_HOURS_CONFIG_UPDATED",
        entityType: "SystemConfig",
        entityId: config.id,
        ipAddress,
        detail: input,
      },
      tx
    );
    return input;
  });
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
  const entries = await prisma.dailyReportEntry.findMany({
    where: { weeklyReport: { studentProfileId } },
    orderBy: { reportDate: "asc" },
    select: { reportDate: true, scheduledHours: true, actualHours: true, attendanceStatus: true },
  });

  const rows = entries.map((entry) =>
    [
      entry.reportDate.toISOString().slice(0, 10),
      Number(entry.scheduledHours).toString(),
      entry.actualHours == null ? "" : Number(entry.actualHours).toString(),
      entry.attendanceStatus,
    ]
      .map(escapeCsvField)
      .join(",")
  );

  return ["date,scheduledHours,actualHours,status", ...rows].join("\n") + "\n";
}

// RFC 4180 quoting, plus a leading-apostrophe guard so a value opening with
// =, +, - or @ can't be evaluated as a formula when the file is opened in a
// spreadsheet (CSV injection).
function escapeCsvField(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
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

  const newScheduleConfig = normalizeSchedule(input.newScheduleConfig);

  return prisma.$transaction(async (tx) => {
    const workPlan = await tx.workPlan.findFirst({
      where: { studentProfileId, status: WorkPlanStatus.APPROVED },
      orderBy: { createdAt: "desc" },
    });
    if (!workPlan) {
      throw new WorkPlanNotApprovedError();
    }
    if (workPlan.scheduleConfig == null) {
      // Nothing to change yet — the initial schedule goes through
      // configureWorkSchedule, which needs no approval.
      throw new ScheduleNotConfiguredError();
    }
    // One request in flight at a time: validateScheduleChangeFaculty and
    // approveScheduleChangeCoordinator gate on the *last* history entry, so
    // a second request appended on top would orphan the first.
    const latestStatus = getLatestScheduleChangeStatus(workPlan.scheduleChangeHistory);
    if (latestStatus && PENDING_SCHEDULE_CHANGE_STATUSES.has(latestStatus)) {
      throw new ScheduleChangePendingError();
    }

    // Carries `newScheduleConfig` per the convention
    // applyScheduleChangeProspectively documents (it reads the target
    // schedule back from this entry).
    await logScheduleChangeHistory(
      workPlan.id,
      {
        timestamp: new Date().toISOString(),
        approverId: null,
        action: "REQUESTED",
        status: "PENDING_FACULTY",
        requestedBy: actingUser.id,
        reason: input.reason,
        previousScheduleConfig: workPlan.scheduleConfig,
        newScheduleConfig,
        supportingDocumentPath: input.supportingDocumentPath ?? null,
      },
      tx
    );

    await logEvent(
      {
        userId: actingUser.id,
        action: "SCHEDULE_CHANGE_REQUESTED",
        entityType: "WorkPlan",
        entityId: workPlan.id,
        ipAddress,
      },
      tx
    );

    return { workPlanId: workPlan.id, status: "PENDING_FACULTY" as const };
  });
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
export class InvalidScheduleChangeStateError extends Error {
  constructor(message = "This schedule change request is not awaiting Faculty review") {
    super(message);
    this.name = "InvalidScheduleChangeStateError";
  }
}

export async function validateScheduleChangeFaculty(
  workPlanId: string,
  facultyId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  void ipAddress;

  // The PENDING_FACULTY read and the resulting history append must be one
  // atomic unit — otherwise two concurrent reviews of the same request (a
  // double-click, a retried request) could both pass the state gate before
  // either has written its outcome. Passing `tx` through to
  // `logScheduleChangeHistory` (which already accepts a transaction client)
  // is what closes that window once B15 implements the actual write.
  return prisma.$transaction(async (tx) => {
    const workPlan = await tx.workPlan.findUniqueOrThrow({ where: { id: workPlanId } });
    const history = (workPlan.scheduleChangeHistory ??
      []) as unknown as ScheduleChangeHistoryEntry[];
    const currentStatus = history.length > 0 ? history[history.length - 1].status : undefined;

    if (currentStatus !== "PENDING_FACULTY") {
      throw new InvalidScheduleChangeStateError();
    }

    const nextStatus = action === "APPROVE" ? "PENDING_COORDINATOR" : "REJECTED";

    await logScheduleChangeHistory(
      workPlanId,
      {
        timestamp: new Date().toISOString(),
        approverId: facultyId,
        action: action === "APPROVE" ? "FACULTY_APPROVED" : "FACULTY_REJECTED",
        status: nextStatus,
      },
      tx
    );

    return { workPlanId, status: nextStatus };
  });
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
export class InvalidScheduleChangeCoordinatorStateError extends Error {
  constructor(message = "This schedule change request is not awaiting Coordinator review") {
    super(message);
    this.name = "InvalidScheduleChangeCoordinatorStateError";
  }
}

export async function approveScheduleChangeCoordinator(
  workPlanId: string,
  coordinatorId: string,
  action: "APPROVE" | "REJECT",
  ipAddress?: string | null
): Promise<{ workPlanId: string; status: string }> {
  void ipAddress;

  // Same reasoning as `validateScheduleChangeFaculty` above: the
  // PENDING_COORDINATOR read and the resulting history append must be one
  // atomic unit so two concurrent coordinator reviews of the same request
  // can't both pass the state gate before either has written its outcome.
  const nextStatus = await prisma.$transaction(async (tx) => {
    const workPlan = await tx.workPlan.findUniqueOrThrow({ where: { id: workPlanId } });
    const history = (workPlan.scheduleChangeHistory ??
      []) as unknown as ScheduleChangeHistoryEntry[];
    const currentStatus = history.length > 0 ? history[history.length - 1].status : undefined;

    if (currentStatus !== "PENDING_COORDINATOR") {
      throw new InvalidScheduleChangeCoordinatorStateError();
    }

    const resultStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";

    await logScheduleChangeHistory(
      workPlanId,
      {
        timestamp: new Date().toISOString(),
        approverId: coordinatorId,
        action: action === "APPROVE" ? "COORDINATOR_APPROVED" : "COORDINATOR_REJECTED",
        status: resultStatus,
      },
      tx
    );

    return resultStatus;
  });

  // Applying the schedule change is a separate, already-transactional step
  // of its own (`applyScheduleChangeProspectively` below) — run after this
  // transaction commits, not nested inside it, same "commit the decision,
  // then act on it" split `reviewWeeklyReport_Approve` uses for its own
  // post-approval side effect.
  if (nextStatus === "APPROVED") {
    await applyScheduleChangeProspectively(workPlanId);
  }

  return { workPlanId, status: nextStatus };
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
export class MissingScheduleChangeRequestError extends Error {
  constructor(message = "No pending schedule-change request found for this work plan") {
    super(message);
    this.name = "MissingScheduleChangeRequestError";
  }
}

// CONVENTION for `requestScheduleChange` (#13, still unimplemented as of
// this writing): the entry it appends via `logScheduleChangeHistory` must
// carry the requested `newScheduleConfig` alongside `status:
// "PENDING_FACULTY"` — that's the only place this function can read the
// target schedule from, since its own signature (fixed by the contract
// above) takes no config argument. Found by scanning history from the end
// for the most recent entry carrying that key, so a later, unrelated
// request further down the same array can't be picked up by mistake.
export async function applyScheduleChangeProspectively(
  workPlanId: string
): Promise<{ workPlanId: string; effectiveFrom: Date }> {
  const effectiveFrom = await prisma.$transaction(async (tx) => {
    const workPlan = await tx.workPlan.findUniqueOrThrow({ where: { id: workPlanId } });
    const history = (workPlan.scheduleChangeHistory ??
      []) as unknown as ScheduleChangeHistoryEntry[];

    const requestEntry = [...history].reverse().find(
      (
        entry
      ): entry is ScheduleChangeHistoryEntry & {
        newScheduleConfig: ConfigureWorkScheduleInput;
      } => "newScheduleConfig" in entry && entry.newScheduleConfig != null
    );

    if (!requestEntry) {
      throw new MissingScheduleChangeRequestError();
    }

    const now = new Date();

    await tx.workPlan.update({
      where: { id: workPlanId },
      data: {
        scheduleConfig: requestEntry.newScheduleConfig as unknown as Prisma.InputJsonValue,
      },
    });

    await logScheduleChangeHistory(
      workPlanId,
      {
        timestamp: now.toISOString(),
        approverId: null,
        action: "SCHEDULE_APPLIED",
        status: "APPLIED",
      },
      tx
    );

    return now;
  });

  const studentProfileId = await getWorkPlanStudentProfileId(workPlanId);
  await computeProjectedCompletionDate(studentProfileId);

  return { workPlanId, effectiveFrom };
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
  const workPlan = await client.workPlan.findUniqueOrThrow({
    where: { id: workPlanId },
    select: { scheduleChangeHistory: true },
  });
  const history = Array.isArray(workPlan.scheduleChangeHistory)
    ? (workPlan.scheduleChangeHistory as unknown as ScheduleChangeHistoryEntry[])
    : [];

  await client.workPlan.update({
    where: { id: workPlanId },
    data: { scheduleChangeHistory: [...history, entry] as unknown as Prisma.InputJsonValue },
  });
}
export interface HoursSummary {
  requiredHours: number;
  confirmedHours: number; // APPROVED/REGARDED only — the "true" hours (FR-AT-05)
  pendingHours: number; // submitted, awaiting faculty review — "temporary"
  remainingHours: number; // against confirmed only
  remainingIfPendingApproved: number;
}

// Lifecycle entry types in WeeklyReport.revisionHistory (see
// weeklyReportService). Kept here as a literal set to avoid an import cycle.
const REVISION_LIFECYCLE_TYPES = new Set(["SUBMITTED", "RETURNED"]);

function isSubmittedAwaitingReview(revisionHistory: unknown): boolean {
  const history = Array.isArray(revisionHistory) ? (revisionHistory as { type?: string }[]) : [];
  const lifecycle = history.filter((e) => e?.type && REVISION_LIFECYCLE_TYPES.has(e.type));
  return lifecycle[lifecycle.length - 1]?.type === "SUBMITTED";
}

// Read-only (no StudentProfile write) — safe to call on every page view.
export async function getHoursSummary(studentProfileId: string): Promise<HoursSummary> {
  const confirmedHours = await calculateRenderedHours(studentProfileId);
  const [openReports, profile] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: {
        studentProfileId,
        status: { in: [WeeklyReportStatus.PENDING, WeeklyReportStatus.RETURNED] },
      },
      select: {
        status: true,
        revisionHistory: true,
        dailyEntries: { select: { actualHours: true } },
      },
    }),
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentProfileId },
      select: { requiredHours: true },
    }),
  ]);

  const pendingHours =
    Math.round(
      openReports
        .filter(
          (r) =>
            r.status === WeeklyReportStatus.PENDING && isSubmittedAwaitingReview(r.revisionHistory)
        )
        .reduce(
          (sum, r) => sum + r.dailyEntries.reduce((s, e) => s + Number(e.actualHours ?? 0), 0),
          0
        ) * 100
    ) / 100;

  const required = profile.requiredHours;
  return {
    requiredHours: required,
    confirmedHours,
    pendingHours,
    remainingHours: Math.max(0, Math.round((required - confirmedHours) * 100) / 100),
    remainingIfPendingApproved: Math.max(
      0,
      Math.round((required - confirmedHours - pendingHours) * 100) / 100
    ),
  };
}

const FINAL_REPORT_THRESHOLD_KEY = (program: Program) => `final_report_threshold:${program}`;

// FR-FT-01: configurable unlock threshold for the final technical report
// (PRD example: 500 of 600 for BSIT). Admin-overridable like required hours.
export async function getFinalReportThreshold(
  program: Program,
  requiredHours: number
): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { configKey: FINAL_REPORT_THRESHOLD_KEY(program) },
    select: { configValue: true },
  });
  const threshold =
    config && typeof config.configValue === "number" && config.configValue > 0
      ? config.configValue
      : program === Program.BSIT
        ? 500
        : Math.ceil((requiredHours * 5) / 6);
  // Never above the student's own requirement, or a student who completes
  // every hour (e.g. required_hours set to 486) could never unlock the cover.
  return Math.min(threshold, requiredHours);
}
