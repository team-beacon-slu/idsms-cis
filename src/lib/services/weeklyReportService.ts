// Weekly report submission and the four-way faculty review action. See PRD
// Module 6 (FR-WR-01–07, FR-WR-09–10). Monthly aggregation lives in
// monthlyReportService.ts (FR-WR-08).
import { randomUUID } from "crypto";
import { z } from "zod";
import { Prisma, Role, WeeklyReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/auditService";
import {
  computeProjectedCompletionDate,
  computeTotalHoursRendered,
  getHolidayCalendarForStudent,
  ScheduleNotConfiguredError,
  WorkPlanNotApprovedError,
  type ConfigureWorkScheduleInput,
} from "@/lib/services/attendanceService";
import { ForbiddenError } from "@/lib/services/userService";
import type { AttendanceStatus } from "@/lib/validators/report";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/workPlanService";
import {
  addDays,
  getWeekStartMonday,
  isWeeklyReportLate,
  toDateKey,
} from "@/lib/utils/reportDeadline";

// ── Submission state ─────────────────────────────────────────────────────
// `WeeklyReportStatus` has no "draft vs. submitted" distinction — PENDING
// covers both a form the student is still filling and one awaiting faculty
// review. Submission is therefore recorded as a `SUBMITTED` entry appended
// to `WeeklyReport.revisionHistory` (the Json array `reviewWeeklyReport_Return`
// also appends to), carrying the FR-WR-10 reference code/timestamp and the
// FR-WR-05 delay reason. A report is awaiting review when its status is
// still PENDING/RETURNED and its most recent history entry is `SUBMITTED`;
// a Return (which appends its own entry and sets RETURNED) reopens it.
export interface WeeklyReportHistoryEntry {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface WeeklyReportSubmissionEntry extends WeeklyReportHistoryEntry {
  type: "SUBMITTED";
  referenceCode: string;
  late: boolean;
  reasonForDelay: string | null;
  submittedBy: string;
}

const FINAL_STATUSES = new Set<WeeklyReportStatus>([
  WeeklyReportStatus.APPROVED,
  WeeklyReportStatus.REGARDED,
  WeeklyReportStatus.DISREGARDED,
]);

export function getWeeklyReportHistory(revisionHistory: unknown): WeeklyReportHistoryEntry[] {
  return Array.isArray(revisionHistory) ? (revisionHistory as WeeklyReportHistoryEntry[]) : [];
}

export function getLatestSubmission(revisionHistory: unknown): WeeklyReportSubmissionEntry | null {
  const history = getWeeklyReportHistory(revisionHistory);
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].type === "SUBMITTED") return history[i] as WeeklyReportSubmissionEntry;
  }
  return null;
}

// Only these entry types move a report through review; any other history
// entry type must never change locked/unlocked state.
const LIFECYCLE_ENTRY_TYPES = new Set(["SUBMITTED", "RETURNED"]);

export function isAwaitingReview(report: {
  status: WeeklyReportStatus;
  revisionHistory: unknown;
}): boolean {
  if (FINAL_STATUSES.has(report.status)) return false;
  const lifecycle = getWeeklyReportHistory(report.revisionHistory).filter((e) =>
    LIFECYCLE_ENTRY_TYPES.has(e.type)
  );
  return lifecycle[lifecycle.length - 1]?.type === "SUBMITTED";
}

// The student may edit daily entries only while the report is a draft or
// has been returned for revision.
export function isWeeklyReportEditable(report: {
  status: WeeklyReportStatus;
  revisionHistory: unknown;
}): boolean {
  return !FINAL_STATUSES.has(report.status) && !isAwaitingReview(report);
}

// The submission the student currently stands behind — none while the report
// is a draft or has been returned for revision, even though an earlier
// SUBMITTED entry remains in the history (FR-DG-05: documents only reflect
// confirmed content).
export function getConfirmedSubmission(report: {
  status: WeeklyReportStatus;
  revisionHistory: unknown;
}): WeeklyReportSubmissionEntry | null {
  return isWeeklyReportEditable(report) ? null : getLatestSubmission(report.revisionHistory);
}

export class WeeklyReportLockedError extends Error {
  constructor(message = "This weekly report is locked — it is under review or already finalized") {
    super(message);
    this.name = "WeeklyReportLockedError";
  }
}

export class WeeklyReportIncompleteError extends Error {
  constructor(message = "Fill in hours and accomplishments for every day before submitting") {
    super(message);
    this.name = "WeeklyReportIncompleteError";
  }
}

export class DailyEntryDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyEntryDateError";
  }
}

export class LateSubmissionReasonRequiredError extends Error {
  constructor(
    message = "This report is past its Tuesday deadline — a reason for delay is required"
  ) {
    super(message);
    this.name = "LateSubmissionReasonRequiredError";
  }
}

// FR-WR-01 — Owner: Shantea23
// Requirement: auto-generate weekly report forms based on each student's
// approved fixed schedule and semester calendar.
// Connects to: called by POST /api/students/[studentProfileId]/weekly-reports
// (Task 12 route, manual "generate this week" fallback). Creates one
// `WeeklyReport` row (unique on `[studentProfileId, weekStart]`) plus one
// `DailyReportEntry` per scheduled working day (`scheduledHours` pre-filled
// from `WorkPlan.scheduleConfig` in `attendanceService.ts`, `actualHours`
// left null), skipping days `attendanceService.getHolidayCalendarForStudent`
// (Task 3) marks non-working.
// Edge cases: violating the `[studentProfileId, weekStart]` unique
// constraint means a report for that week already exists — decide whether
// to return the existing row or throw.
// Decision: return the existing row (idempotent). The student-facing
// "Start this week's report" button can be clicked twice or retried without
// erroring, and a report that already has entries is never overwritten.
// `weekStart` is normalized to the Monday of its week, so any day of the
// week maps to the same Mon–Sun report.
export async function generateWeeklyReportForm(
  studentProfileId: string,
  weekStart: Date
): Promise<{ weeklyReportId: string; weekStart: Date; weekEnd: Date }> {
  const normalizedWeekStart = getWeekStartMonday(weekStart);
  const weekEnd = addDays(normalizedWeekStart, 6);

  const existing = await prisma.weeklyReport.findUnique({
    where: { studentProfileId_weekStart: { studentProfileId, weekStart: normalizedWeekStart } },
    select: { id: true },
  });
  if (existing) {
    return { weeklyReportId: existing.id, weekStart: normalizedWeekStart, weekEnd };
  }

  const workPlan = await getLatestApprovedWorkPlanForStudent(studentProfileId);
  if (!workPlan) {
    throw new WorkPlanNotApprovedError();
  }
  const schedule = workPlan.scheduleConfig as unknown as ConfigureWorkScheduleInput | null;
  if (!schedule?.daysOfWeek?.length || !schedule.hoursPerDay) {
    throw new ScheduleNotConfiguredError();
  }

  const holidays = await getHolidayCalendarForStudent(studentProfileId);
  const holidayDates = new Set(holidays.filter((h) => h.applicable).map((h) => toDateKey(h.date)));
  const workingDays = new Set(schedule.daysOfWeek);

  // Applicable holidays on scheduled days get a 0-hour HOLIDAY row so the SLU
  // template can print "Holiday (PH Calendar)".
  const dailyEntries: Prisma.DailyReportEntryCreateWithoutWeeklyReportInput[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const day = addDays(normalizedWeekStart, offset);
    if (!workingDays.has(day.getUTCDay())) continue;
    dailyEntries.push(
      holidayDates.has(toDateKey(day))
        ? {
            reportDate: day,
            attendanceStatus: "HOLIDAY",
            scheduledHours: schedule.hoursPerDay,
            actualHours: 0,
          }
        : { reportDate: day, attendanceStatus: "SCHEDULED", scheduledHours: schedule.hoursPerDay }
    );
  }

  try {
    const report = await prisma.weeklyReport.create({
      data: {
        studentProfileId,
        weekStart: normalizedWeekStart,
        weekEnd,
        dailyEntries: { create: dailyEntries },
      },
      select: { id: true },
    });
    return { weeklyReportId: report.id, weekStart: normalizedWeekStart, weekEnd };
  } catch (error) {
    // Lost a race with a concurrent generate for the same week — the unique
    // constraint did its job, hand back the row the other request created.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const report = await prisma.weeklyReport.findUniqueOrThrow({
        where: { studentProfileId_weekStart: { studentProfileId, weekStart: normalizedWeekStart } },
        select: { id: true },
      });
      return { weeklyReportId: report.id, weekStart: normalizedWeekStart, weekEnd };
    }
    throw error;
  }
}

// FR-WR-02 — Owner: KennethRusselAvaricio
// Requirement: total hours for the week must be auto-calculated.
// Connects to: called by PATCH /api/weekly-reports/[id] (Task 12 route)
// after every `saveDailyAccomplishment` call below, so the client form can
// show a live total. Sums `DailyReportEntry.actualHours` for this report,
// writes `WeeklyReport.totalHours` (Decimal).
// Edge cases: null `actualHours` (not yet filled in) should count as 0, not throw.
export async function calculateWeeklyTotalHours(weeklyReportId: string): Promise<number> {
  const entries = await prisma.dailyReportEntry.findMany({
    where: { weeklyReportId },
    select: { actualHours: true },
  });
  const totalHours = roundHours(
    entries.reduce((sum, entry) => sum + Number(entry.actualHours ?? 0), 0)
  );

  await prisma.weeklyReport.update({ where: { id: weeklyReportId }, data: { totalHours } });
  return totalHours;
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

// FR-WR-02 — Owner: KennethRusselAvaricio
// Requirement: running total hours and hours remaining must be auto-calculated.
// Connects to: called from the same PATCH /api/weekly-reports/[id] route as
// `calculateWeeklyTotalHours` above. Writes `WeeklyReport.runningTotal`
// (cumulative across prior APPROVED/REGARDED weeks + this one, Decimal) and
// `WeeklyReport.remainingHours` (against `StudentProfile.requiredHours`).
// Edge cases: only prior weeks with status APPROVED or REGARDED count
// toward the running total — same status filter as
// `attendanceService.computeTotalHoursRendered`.
export async function calculateRunningTotalAndRemaining(
  studentProfileId: string,
  weeklyReportId: string
): Promise<{ runningTotal: number; remainingHours: number }> {
  const [report, studentProfile] = await Promise.all([
    prisma.weeklyReport.findUniqueOrThrow({
      where: { id: weeklyReportId },
      select: { weekStart: true, dailyEntries: { select: { actualHours: true } } },
    }),
    prisma.studentProfile.findUniqueOrThrow({
      where: { id: studentProfileId },
      select: { requiredHours: true },
    }),
  ]);

  const priorReports = await prisma.weeklyReport.findMany({
    where: {
      studentProfileId,
      id: { not: weeklyReportId },
      weekStart: { lt: report.weekStart },
      status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
    },
    select: { dailyEntries: { select: { actualHours: true } } },
  });

  const sumEntries = (entries: { actualHours: Prisma.Decimal | null }[]) =>
    entries.reduce((sum, entry) => sum + Number(entry.actualHours ?? 0), 0);

  const runningTotal = roundHours(
    priorReports.reduce((sum, prior) => sum + sumEntries(prior.dailyEntries), 0) +
      sumEntries(report.dailyEntries)
  );
  const remainingHours = roundHours(Math.max(0, studentProfile.requiredHours - runningTotal));

  await prisma.weeklyReport.update({
    where: { id: weeklyReportId },
    data: { runningTotal, remainingHours },
  });

  return { runningTotal, remainingHours };
}

// FR-WR-03 — Owner: gu457 (Ulrich)
// Requirement: only the student may enter actual hours worked and daily
// accomplishments.
// Connects to: called by PATCH /api/weekly-reports/[id] (Task 12 route),
// which then calls `calculateWeeklyTotalHours` and
// `calculateRunningTotalAndRemaining` above and returns all three in one
// response. Writes a single `DailyReportEntry` row (`actualHours`,
// `accomplishments`).
// Edge cases: enforce the caller (`studentUserId`) is the owning student —
// self-only, same pattern as `assertCanAccessStudent` elsewhere — and that
// the parent `WeeklyReport.status` is not already
// APPROVED/REGARDED/DISREGARDED (those are locked).
export async function saveDailyAccomplishment(
  dailyReportEntryId: string,
  hours: number,
  accomplishments: string,
  studentUserId: string,
  toolsUsed?: string | null,
  details: {
    attendanceStatus?: AttendanceStatus;
    timeIn?: string | null;
    timeOut?: string | null;
    timeIn2?: string | null;
    timeOut2?: string | null;
  } = {}
): Promise<{ id: string; hours: number; accomplishments: string }> {
  // Explicit status wins; legacy callers (no status) keep the old
  // hours-derived behaviour. Non-PRESENT days always count 0 hours.
  const status: AttendanceStatus = details.attendanceStatus ?? (hours > 0 ? "PRESENT" : "ABSENT");
  const isPresent = status === "PRESENT";
  return prisma.$transaction(async (tx) => {
    const entry = await tx.dailyReportEntry.findUniqueOrThrow({
      where: { id: dailyReportEntryId },
      select: {
        weeklyReport: {
          select: {
            status: true,
            revisionHistory: true,
            studentProfile: { select: { userId: true } },
          },
        },
      },
    });

    if (entry.weeklyReport.studentProfile.userId !== studentUserId) {
      throw new ForbiddenError("Only the student who owns this report can edit it");
    }
    if (!isWeeklyReportEditable(entry.weeklyReport)) {
      throw new WeeklyReportLockedError();
    }

    const updated = await tx.dailyReportEntry.update({
      where: { id: dailyReportEntryId },
      data: {
        attendanceStatus: status,
        ...(isPresent
          ? {
              actualHours: hours,
              accomplishments,
              // Optional third column of the daily form; undefined leaves it untouched.
              ...(toolsUsed !== undefined ? { toolsUsed: toolsUsed || null } : {}),
              ...(details.timeIn !== undefined ? { timeIn: details.timeIn } : {}),
              ...(details.timeOut !== undefined ? { timeOut: details.timeOut } : {}),
              ...(details.timeIn2 !== undefined ? { timeIn2: details.timeIn2 } : {}),
              ...(details.timeOut2 !== undefined ? { timeOut2: details.timeOut2 } : {}),
            }
          : // Absent/holiday days carry nothing that could print on the PDF.
            {
              actualHours: 0,
              accomplishments: "",
              toolsUsed: null,
              timeIn: null,
              timeOut: null,
              timeIn2: null,
              timeOut2: null,
            }),
      },
      select: { id: true, actualHours: true, accomplishments: true },
    });

    return {
      id: updated.id,
      hours: Number(updated.actualHours ?? 0),
      accomplishments: updated.accomplishments ?? "",
    };
  });
}

// Workstream L1: a row for a non-scheduled date in the week (e.g. a Saturday
// worked under an approved OT request). Owner only, editable weeks only.
export async function addDailyEntry(
  weeklyReportId: string,
  reportDate: Date,
  studentUserId: string
): Promise<{ id: string }> {
  const report = await prisma.weeklyReport.findUniqueOrThrow({
    where: { id: weeklyReportId },
    select: {
      weekStart: true,
      weekEnd: true,
      status: true,
      revisionHistory: true,
      studentProfile: { select: { userId: true } },
      dailyEntries: { select: { reportDate: true } },
    },
  });
  if (report.studentProfile.userId !== studentUserId) {
    throw new ForbiddenError("Only the student who owns this report can edit it");
  }
  if (!isWeeklyReportEditable(report)) throw new WeeklyReportLockedError();
  const key = toDateKey(reportDate);
  if (key < toDateKey(report.weekStart) || key > toDateKey(report.weekEnd)) {
    throw new DailyEntryDateError("Pick a date within this report's week");
  }
  if (report.dailyEntries.some((e) => toDateKey(e.reportDate) === key)) {
    throw new DailyEntryDateError("That day is already in this report");
  }
  return prisma.dailyReportEntry.create({
    data: { weeklyReportId, reportDate, attendanceStatus: "SCHEDULED", scheduledHours: 0 },
    select: { id: true },
  });
}

// FR-WR-05 — Owner: Shantea23
// Requirement: reports are due Tuesday; late submissions require the
// student to fill out a mandatory "Reason for Delay" field before the
// system accepts the submission. Faculty can view this note during review.
// Connects to: called by POST /api/weekly-reports/[id]/submit (Task 12
// route) before `generateReportReferenceCode` below. No dedicated schema
// field currently exists for the delay reason — store it in
// `WeeklyReport.revisionHistory` (Json, already used by
// `reviewWeeklyReport_Return` below) or add a field; note whichever choice
// is made here in this comment for `reviewWeeklyReport_*`'s implementers to
// find it.
// Edge cases: no-op (don't throw) if the report is not actually late.
// Decision: the delay reason is stored on the `SUBMITTED` revisionHistory
// entry written by `recordWeeklyReportSubmission` below (field
// `reasonForDelay`, plus `late: true`) — read it back with
// `getLatestSubmission(report.revisionHistory)`. "Late" means after
// 23:59 Manila time on the Tuesday following `weekEnd`
// (`src/lib/utils/reportDeadline.ts`).
export async function validateLateSubmissionReason(
  weeklyReportId: string,
  reasonForDelay?: string
): Promise<void> {
  const report = await prisma.weeklyReport.findUniqueOrThrow({
    where: { id: weeklyReportId },
    select: { weekEnd: true },
  });

  if (!isWeeklyReportLate(report.weekEnd)) {
    return;
  }
  if (!reasonForDelay?.trim()) {
    throw new LateSubmissionReasonRequiredError();
  }
}

// Not one of the original Phase 3 stubs — added because nothing else persists
// the act of submitting (see the "Submission state" note at the top of this
// file). Called by POST /api/weekly-reports/[id]/submit after
// `validateLateSubmissionReason` and `generateReportReferenceCode`. Rejects a
// report that is already awaiting review or finalized, or that still has
// unfilled days; a RETURNED report goes back to PENDING on resubmission.
export async function recordWeeklyReportSubmission(
  weeklyReportId: string,
  submission: { referenceCode: string; timestamp: Date; reasonForDelay?: string | null },
  actingUser: { id: string; role: Role },
  ipAddress?: string | null
): Promise<WeeklyReportSubmissionEntry> {
  return prisma.$transaction(async (tx) => {
    const report = await tx.weeklyReport.findUniqueOrThrow({
      where: { id: weeklyReportId },
      select: {
        status: true,
        weekEnd: true,
        revisionHistory: true,
        dailyEntries: {
          select: { actualHours: true, accomplishments: true, attendanceStatus: true },
        },
      },
    });

    if (!isWeeklyReportEditable(report)) {
      throw new WeeklyReportLockedError();
    }
    const incomplete =
      report.dailyEntries.length === 0 ||
      report.dailyEntries.some((e) => {
        if (e.actualHours == null || e.attendanceStatus === "SCHEDULED") return true;
        // Absent/holiday days carry no accomplishments.
        return e.attendanceStatus === "PRESENT" && !e.accomplishments?.trim();
      });
    if (incomplete) {
      throw new WeeklyReportIncompleteError();
    }

    const late = isWeeklyReportLate(report.weekEnd, submission.timestamp);
    const entry: WeeklyReportSubmissionEntry = {
      type: "SUBMITTED",
      timestamp: submission.timestamp.toISOString(),
      referenceCode: submission.referenceCode,
      late,
      reasonForDelay: late ? (submission.reasonForDelay?.trim() ?? null) : null,
      submittedBy: actingUser.id,
    };

    await tx.weeklyReport.update({
      where: { id: weeklyReportId },
      data: {
        status: WeeklyReportStatus.PENDING,
        revisionHistory: [
          ...getWeeklyReportHistory(report.revisionHistory),
          entry,
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    await logEvent(
      {
        userId: actingUser.id,
        action: "WEEKLY_REPORT_SUBMITTED",
        entityType: "WeeklyReport",
        entityId: weeklyReportId,
        ipAddress,
        detail: { referenceCode: submission.referenceCode, late },
      },
      tx
    );

    return entry;
  });
}

// FR-WR-06 (Approve) — Owner: JayPing23 (Danielle)
// Requirement: Faculty can Approve — hours count, status complete.
// Connects to: called by PATCH /api/weekly-reports/[id]/review (Task 12
// route, `action: "APPROVE"`, Faculty-only). Sets `WeeklyReport.status =
// APPROVED` and `facultyAction`. Must call
// `attendanceService.computeTotalHoursRendered` +
// `computeProjectedCompletionDate` (Task 3) afterward, since this report's
// hours now count toward both. The route also calls
// `notificationService.sendReportStatusEmail` (Task 8) after this returns.
// Edge cases: none beyond the status transition itself.
export async function reviewWeeklyReport_Approve(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  void ipAddress;

  // No dedicated `facultyId` column exists on `WeeklyReport` (see the
  // model in schema.prisma) — `facultyAction` is the only free-text field
  // available to record who reviewed it. A single unconditional update
  // needs no `$transaction` wrapper — there's no read-then-write state
  // gate here.
  const { id, status, studentProfileId } = await prisma.weeklyReport.update({
    where: { id: weeklyReportId },
    data: {
      status: WeeklyReportStatus.APPROVED,
      facultyAction: `APPROVED by ${facultyId}`,
    },
    select: { id: true, status: true, studentProfileId: true },
  });

  // This report's hours now count toward both, per the contract above —
  // no `logEvent` audit-log call here, the contract doesn't ask for one.
  await computeTotalHoursRendered(studentProfileId);
  await computeProjectedCompletionDate(studentProfileId);

  return { id, status };
}

// FR-WR-06 (Return) — Owner: KennethRusselAvaricio
// Requirement: Faculty can Return — requires student revision, hours do
// not count yet.
// Connects to: called by the same PATCH /api/weekly-reports/[id]/review
// route (`action: "RETURN"`). Sets `WeeklyReport.status = RETURNED`,
// appends `notes` to `WeeklyReport.revisionHistory` (Json array).
// Edge cases: hours must NOT be recomputed — a RETURNED report is excluded
// from `computeTotalHoursRendered`'s status filter by construction.
export async function reviewWeeklyReport_Return(
  weeklyReportId: string,
  facultyId: string,
  notes: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  const revisionNotes = z.string().trim().min(1, "Revision notes are required").parse(notes);
  return prisma.$transaction(async (tx) => {
    const report = await tx.weeklyReport.findUniqueOrThrow({
      where: { id: weeklyReportId },
      select: { revisionHistory: true },
    });
    const entry = {
      type: "RETURNED",
      timestamp: new Date().toISOString(),
      facultyId,
      notes: revisionNotes,
    };
    const result = await tx.weeklyReport.update({
      where: { id: weeklyReportId },
      data: {
        status: WeeklyReportStatus.RETURNED,
        facultyAction: `RETURNED by ${facultyId}`,
        revisionHistory: [
          ...getWeeklyReportHistory(report.revisionHistory),
          entry,
        ] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, status: true },
    });
    await logEvent(
      {
        userId: facultyId,
        action: "WEEKLY_REPORT_RETURNED",
        entityType: "WeeklyReport",
        entityId: weeklyReportId,
        ipAddress,
        detail: { notes: revisionNotes },
      },
      tx
    );
    return result;
  });
}

// FR-WR-06 (Regard) — Owner: KennethRusselAvaricio
// Requirement: Faculty can Regard — acknowledged, hours count, but marked
// for minor improvement/no revision needed.
// Connects to: same review route (`action: "REGARD"`). Sets
// `WeeklyReport.status = REGARDED` — hours count exactly like Approve
// (trigger `computeTotalHoursRendered`/`computeProjectedCompletionDate`,
// Task 3), the status is just visually distinct in the UI.
// Edge cases: none — this is the "same effect as Approve, different label" branch.
export async function reviewWeeklyReport_Regard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  void ipAddress;
  const { id, status, studentProfileId } = await prisma.weeklyReport.update({
    where: { id: weeklyReportId },
    data: { status: WeeklyReportStatus.REGARDED, facultyAction: `REGARDED by ${facultyId}` },
    select: { id: true, status: true, studentProfileId: true },
  });
  await computeTotalHoursRendered(studentProfileId);
  await computeProjectedCompletionDate(studentProfileId);
  return { id, status };
}

// FR-WR-06 (Disregard) — Owner: JayPing23 (Danielle)
// Requirement: Faculty can Disregard — invalid submission (e.g. wrong
// week), hours do not count, requires full resubmission.
// Connects to: same review route (`action: "DISREGARD"`). Sets
// `WeeklyReport.status = DISREGARDED`; excluded from
// `computeTotalHoursRendered`. Must clear/reset the row so
// `generateWeeklyReportForm` above can regenerate a fresh form for that
// week without violating the `[studentProfileId, weekStart]` unique constraint.
// Edge cases: deciding "clear vs. delete-and-recreate" for the DISREGARDED
// row is this function's actual design work — document the choice here for
// `generateWeeklyReportForm`'s implementer.
//
// Design choice for the edge case above: delete-and-recreate. A DISREGARDED
// report is never displayed again (excluded from every downstream read) and
// carries no state worth preserving, so the simplest way to free up
// `[studentProfileId, weekStart]` for a fresh row is to delete this one
// outright — `generateWeeklyReportForm` (still a stub, owned by
// Shantea23/Task 4) then needs no special-case handling for a leftover
// DISREGARDED row; its plain `create` just works. `DailyReportEntry` has no
// `onDelete: Cascade` back to `WeeklyReport` (see schema.prisma), so its rows
// are deleted first, in the same transaction. No `logEvent` call: this
// contract, unlike `configureWorkSchedule`/`submitDeviationReport` above,
// never says "Log via logEvent" (same reasoning as `reviewWeeklyReport_Approve`'s
// precedent) — and here there's also no surviving row to attach a
// `facultyAction` note to before it's deleted.
// Flag for whoever implements FR-WR-07 (`sendReportStatusEmail`, issue #27,
// still unassigned): the review route calls it with only `weeklyReportId`
// right after this function returns, for every action including DISREGARD —
// by then the row is already gone, so that implementation must not assume
// the row still exists when `action === "DISREGARD"` (build that email from
// the id + action alone, don't `findUnique`/`findUniqueOrThrow` it).
export async function reviewWeeklyReport_Disregard(
  weeklyReportId: string,
  facultyId: string,
  ipAddress?: string | null
): Promise<{ id: string; status: WeeklyReportStatus }> {
  void facultyId;
  void ipAddress;

  return prisma.$transaction(async (tx) => {
    await tx.dailyReportEntry.deleteMany({ where: { weeklyReportId } });
    await tx.weeklyReport.delete({ where: { id: weeklyReportId } });

    return { id: weeklyReportId, status: WeeklyReportStatus.DISREGARDED };
  });
}

// FR-WR-09 — Owner: gu457 (Ulrich)
// Requirement: students must be able to preview a PDF of their report
// before final submission.
// Connects to: called by GET /api/weekly-reports/[id]/preview (Task 12
// route). This is a lightweight preview, NOT the final Puppeteer-rendered
// PDF from Module 8's `documentService.ts` (out of scope for Phase 3 — see
// the design spec's "Out of scope" section).
// Edge cases: none — read-only rendering.
// Implementation: points at a print-styled preview page
// (`/students/[studentProfileId]/weekly-reports/[id]/preview`) that renders
// the report the way the final document lays it out; the browser's
// "Save as PDF" produces the file. No server-side PDF engine needed until
// Module 8 lands.
export async function generateReportPdfPreview(
  weeklyReportId: string
): Promise<{ previewUrl: string | null }> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    select: { studentProfileId: true },
  });
  if (!report) {
    return { previewUrl: null };
  }
  return {
    previewUrl: `/students/${report.studentProfileId}/weekly-reports/${weeklyReportId}/preview`,
  };
}

// FR-WR-10 — Owner: Shantea23
// Requirement: a submitted report PDF must be auto-generated with a system
// reference code and timestamp.
// Connects to: called by POST /api/weekly-reports/[id]/submit (Task 12
// route), after `validateLateSubmissionReason` above passes. The actual PDF
// file generation is Module 8's job (out of scope here) — this function
// only produces the reference code + timestamp pair that gets attached to it.
// Edge cases: reference code must be globally unique (matches the pattern
// `GeneratedDocument.referenceCode`'s `@unique` constraint expects, even
// though this function doesn't write to that table directly).
// Format: `WR-<week start YYYYMMDD>-<8 hex chars from a random UUID>`, e.g.
// `WR-20261005-3F9A1C02`. The random segment gives 2^32 codes per week per
// system, so collisions are negligible; the date prefix keeps codes
// human-sortable on printed reports.
export async function generateReportReferenceCode(
  weeklyReportId: string
): Promise<{ referenceCode: string; timestamp: Date }> {
  const report = await prisma.weeklyReport.findUniqueOrThrow({
    where: { id: weeklyReportId },
    select: { weekStart: true },
  });
  const datePart = toDateKey(report.weekStart).replace(/-/g, "");
  const randomPart = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return { referenceCode: `WR-${datePart}-${randomPart}`, timestamp: new Date() };
}

// Trivial reads — not stubs, match Phase 2's listCompanies precedent.
export async function listWeeklyReportsForStudent(studentProfileId: string) {
  return prisma.weeklyReport.findMany({
    where: { studentProfileId },
    orderBy: { weekStart: "desc" },
  });
}

export async function getWeeklyReport(weeklyReportId: string) {
  return prisma.weeklyReport.findUnique({
    where: { id: weeklyReportId },
    include: { dailyEntries: true },
  });
}

// Trivial read — not a stub. Resolves the owning WeeklyReport for a
// DailyReportEntry id, same reason and same pattern as
// `attendanceService.getWorkPlanStudentProfileId`: a `dailyReportEntryId`
// alone carries no ownership information, so PATCH /api/weekly-reports/[id]
// (Task 12 route) must call this and compare against `params.id` before
// calling `saveDailyAccomplishment` — otherwise a caller who legitimately
// owns one WeeklyReport could write into another student's daily entry row
// by supplying its id in the request body. Throws if the DailyReportEntry
// doesn't exist, matching `findUniqueOrThrow`'s use elsewhere in this
// codebase (see `companyService.updateMoaRecordStatus`).
export async function getDailyReportEntryWeeklyReportId(
  dailyReportEntryId: string
): Promise<string> {
  const dailyReportEntry = await prisma.dailyReportEntry.findUniqueOrThrow({
    where: { id: dailyReportEntryId },
    select: { weeklyReportId: true },
  });
  return dailyReportEntry.weeklyReportId;
}
