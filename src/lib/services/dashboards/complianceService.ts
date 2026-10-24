import { Role, type Prisma, type Program, type WeeklyReportStatus } from "@prisma/client";
import { buildInternshipTrack, type TrackKind } from "@/lib/utils/internshipTrack";

import { prisma } from "@/lib/prisma";
import { requestCache } from "@/lib/utils/requestCache";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import { getLatestSubmission, isAwaitingReview } from "@/lib/services/reports/weeklyReportService";
import {
  checklistRequirements,
  getRequiredChecklistTypes,
} from "@/lib/services/predeployment/checklistService";
import { CREDITED_HOURS_SELECT, sumCreditedHours } from "@/lib/utils/creditedHours";
import { formatManilaDateTime } from "@/lib/utils/excelExport";
import {
  addDays,
  getWeekStartMonday,
  isWeeklyReportLate,
  toDateKey,
} from "@/lib/utils/reportDeadline";

export type ReportState =
  "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "REGARDED" | "DISREGARDED";
export type ComplianceStatus = "NOT_DEPLOYED" | "NEEDS_ATTENTION" | "ON_TRACK" | "COMPLETED";
export type ComplianceScope =
  | { kind: "faculty"; facultyId: string }
  | { kind: "department"; semesterId: string; program?: Program };

const RECENT_WEEKS = 8;

export interface ComplianceRow {
  studentProfileId: string;
  studentNumber: string;
  fullName: string | null;
  email: string;
  program: Program;
  classGroupId: string;
  classGroup: string;
  company: string | null;
  confirmedHours: number;
  requiredHours: number;
  hoursPercent: number; // 0-100, integer
  checklistApproved: number;
  checklistTotal: number;
  dueWeekStart: string; // "YYYY-MM-DD" of the week whose report is due now
  dueWeekState: ReportState; // state of that week's report
  awaitingReview: number; // reports of any week waiting on faculty
  status: ComplianceStatus;
  recentWeeks: TrackKind[]; // last 8 weeks up to this one, oldest first (the roster's mini track)
}

// Spreadsheet shape shared by the F compliance export and the G admin
// "students" export, so the column list lives in exactly one place.
export const COMPLIANCE_COLUMNS: Array<{ key: string; header: string }> = [
  { key: "studentNumber", header: "Student number" },
  { key: "fullName", header: "Name" },
  { key: "email", header: "Email" },
  { key: "program", header: "Program" },
  { key: "classGroup", header: "Class group" },
  { key: "company", header: "Company" },
  { key: "confirmedHours", header: "Confirmed hours" },
  { key: "requiredHours", header: "Required hours" },
  { key: "hoursPercent", header: "Hours %" },
  { key: "checklistApproved", header: "Checklist approved" },
  { key: "dueWeekState", header: "Due-week report" },
  { key: "awaitingReview", header: "Awaiting review" },
  { key: "status", header: "Status" },
];

// ComplianceRow -> record keyed by COMPLIANCE_COLUMNS ("approved/9" display).
export function toComplianceSheetRow(r: ComplianceRow): Record<string, unknown> {
  return { ...r, checklistApproved: `${r.checklistApproved}/${r.checklistTotal}` };
}

const CONFIRMING_STATUSES = new Set<WeeklyReportStatus>(["APPROVED", "REGARDED"]);
const UNSUBMITTED_STATES = new Set<ReportState>(["NOT_STARTED", "DRAFT", "RETURNED"]);
const SUBMITTED_STATES = new Set<ReportState>(["SUBMITTED", "APPROVED", "REGARDED", "DISREGARDED"]);

// undefined -> NOT_STARTED; APPROVED/REGARDED/DISREGARDED/RETURNED map 1:1;
// PENDING is SUBMITTED only while it is waiting on faculty, else still a DRAFT.
export function reportState(
  r: { status: WeeklyReportStatus; revisionHistory: unknown } | undefined
): ReportState {
  if (!r) return "NOT_STARTED";
  if (r.status === "PENDING") return isAwaitingReview(r) ? "SUBMITTED" : "DRAFT";
  return r.status;
}

export interface WeeklyHistoryInput {
  id: string;
  weekStart: Date;
  weekEnd: Date;
  status: WeeklyReportStatus;
  revisionHistory: unknown;
}

export interface WeeklyHistoryRow {
  id: string;
  week: string;
  state: ReportState;
  referenceCode: string | null;
}

const WEEK_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC", // week dates are stored as UTC midnight
});

// FR-DB-02: student's weekly report history, newest week first. The reference
// code lives on the latest SUBMITTED history entry (no column on the report).
export function weeklyHistory(reports: WeeklyHistoryInput[]): WeeklyHistoryRow[] {
  return [...reports]
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
    .map((r) => ({
      id: r.id,
      week:
        WEEK_LABEL.format(r.weekStart) +
        " – " +
        WEEK_LABEL.format(r.weekEnd) +
        ", " +
        r.weekEnd.getUTCFullYear(),
      state: reportState(r),
      referenceCode: getLatestSubmission(r.revisionHistory)?.referenceCode ?? null,
    }));
}

// Per render: the faculty dashboard asks for the same scope's rows and its student ids.
const scopeWhere = requestCache(async function scopeWhere(
  scope: ComplianceScope
): Promise<Prisma.StudentProfileWhereInput | null> {
  if (scope.kind === "department") {
    // Deliberately no archivedAt/isActive condition: archived semesters stay
    // fully readable (FR-DB-07).
    return {
      deletedAt: null,
      semesterId: scope.semesterId,
      ...(scope.program ? { program: scope.program } : {}),
    };
  }
  const pairs = await prisma.facultyClassGroup.findMany({
    // Archived semesters are last term's cohort; they leave the adviser's
    // working scope (the department view still reads them, FR-DB-07).
    where: { facultyId: scope.facultyId, semester: { archivedAt: null } },
    select: { classGroupId: true, semesterId: true },
  });
  // Zero pairs means zero students; never send an empty `OR: []`.
  if (pairs.length === 0) return null;
  return {
    deletedAt: null,
    OR: pairs.map((p) => ({ classGroupId: p.classGroupId, semesterId: p.semesterId })),
  };
});

// Just the ids in scope, so per-student work can start without waiting for the full rows.
export async function getComplianceStudentIds(scope: ComplianceScope): Promise<string[]> {
  const where = await scopeWhere(scope);
  if (!where) return [];
  const students = await prisma.studentProfile.findMany({ where, select: { id: true } });
  return students.map((s) => s.id);
}

export async function getComplianceRows(
  scope: ComplianceScope,
  now: Date = new Date()
): Promise<ComplianceRow[]> {
  const [where, required] = await Promise.all([scopeWhere(scope), getRequiredChecklistTypes()]);
  if (!where) return [];

  // Due week = the Monday-Sunday week before the current Manila week; that
  // report is due Tuesday of the current week.
  const dueWeekStart = addDays(getWeekStartMonday(now), -7);
  const dueKey = toDateKey(dueWeekStart);

  // One bounded query for the whole scope: no per-student follow-up queries.
  const students = await prisma.studentProfile.findMany({
    where,
    select: {
      id: true,
      studentNumber: true,
      fullName: true,
      program: true,
      classGroupId: true,
      companyId: true,
      requiredHours: true,
      startBeforeMoaAllowed: true,
      user: { select: { email: true } },
      classGroup: { select: { name: true, classType: true } },
      company: { select: { name: true, isForeign: true } },
      checklistItems: { select: { requirementType: true, status: true } },
      weeklyReports: {
        select: {
          weekStart: true,
          status: true,
          revisionHistory: true,
          dailyEntries: { select: CREDITED_HOURS_SELECT },
        },
      },
      conductRecords: { where: { revokedAt: null }, select: { hoursDeducted: true } },
    },
    orderBy: { studentNumber: "asc" },
  });

  return students.map((s) => {
    // Same rule as calculateRenderedHours: only APPROVED + REGARDED reports
    // count, minus active conduct-record hours (L2), never below 0.
    const credited = sumCreditedHours(
      s.weeklyReports
        .filter((report) => CONFIRMING_STATUSES.has(report.status))
        .flatMap((report) => report.dailyEntries)
    );
    const deducted = (s.conductRecords ?? []).reduce((t, r) => t + Number(r.hoursDeducted), 0);
    const confirmedHours = Math.max(0, Math.round((credited - deducted) * 100) / 100);
    const hoursPercent =
      s.requiredHours > 0 ? Math.min(100, Math.round((confirmedHours / s.requiredHours) * 100)) : 0;

    // Counted against this intern's required items (Super Admin list, minus what doesn't apply).
    const { gate } = checklistRequirements(required, {
      isForeignCompany: s.company?.isForeign ?? false,
      classType: s.classGroup?.classType ?? null,
      startBeforeMoaAllowed: s.startBeforeMoaAllowed ?? false,
    });
    const checklistApproved = s.checklistItems.filter(
      (i) => i.status === "APPROVED" && gate.has(i.requirementType)
    ).length;
    const checklistTotal = gate.size;
    const dueWeekState = reportState(
      s.weeklyReports.find((r) => toDateKey(r.weekStart) === dueKey)
    );
    const awaitingReview = s.weeklyReports.filter((r) => isAwaitingReview(r)).length;

    let status: ComplianceStatus;
    if (!s.companyId) status = "NOT_DEPLOYED";
    else if (s.requiredHours > 0 && confirmedHours >= s.requiredHours) status = "COMPLETED";
    else if (checklistApproved < checklistTotal || UNSUBMITTED_STATES.has(dueWeekState))
      status = "NEEDS_ATTENTION";
    else status = "ON_TRACK";

    // The window ends at the current week, not the track's end: a report filed early for a
    // future week extends the track past today. shortcut: a track capped before today
    // (MAX_TRACK_WEEKS, longer than any SIPP term) gets no mini track.
    const track = buildInternshipTrack({
      reports: s.weeklyReports.map((r) => ({ weekStart: r.weekStart, state: reportState(r) })),
      projectedFinish: null,
      now,
    });
    const current = track.findIndex((w) => w.isCurrent);
    const recentWeeks =
      current === -1
        ? []
        : track
            .slice(0, current + 1)
            .slice(-RECENT_WEEKS)
            .map((w) => w.kind);

    return {
      studentProfileId: s.id,
      studentNumber: s.studentNumber,
      fullName: s.fullName,
      email: s.user.email,
      program: s.program,
      classGroupId: s.classGroupId,
      classGroup: s.classGroup.name,
      company: s.company?.name ?? null,
      confirmedHours,
      requiredHours: s.requiredHours,
      hoursPercent,
      checklistApproved,
      checklistTotal,
      dueWeekStart: dueKey,
      dueWeekState,
      awaitingReview,
      status,
      recentWeeks,
    };
  });
}

export interface WeeklySummaryRow {
  studentNumber: string;
  fullName: string | null;
  program: Program;
  classGroup: string;
  state: ReportState;
  hours: number; // that week's logged hours; 0 when there is no report
  submittedAt: string | null; // last SUBMITTED entry, "YYYY-MM-DD HH:mm" Manila
  late: boolean;
}

// FR-DB-06: one row per student in scope for the week starting `weekStart`
// (a Monday, UTC midnight). Students with no report that week still appear as
// NOT_STARTED with 0 hours. Hours are everything logged that week, whatever
// the report's review status. The unique (studentProfileId, weekStart) index
// serves the nested report filter, and there are no per-student queries.
export async function getWeeklySummaryRows(
  scope: ComplianceScope,
  weekStart: Date
): Promise<WeeklySummaryRow[]> {
  const where = await scopeWhere(scope);
  if (!where) return [];

  const weekEnd = addDays(weekStart, 6);
  const students = await prisma.studentProfile.findMany({
    where,
    select: {
      studentNumber: true,
      fullName: true,
      program: true,
      classGroup: { select: { name: true } },
      weeklyReports: {
        where: { weekStart },
        select: {
          status: true,
          revisionHistory: true,
          dailyEntries: { select: CREDITED_HOURS_SELECT },
        },
      },
    },
    orderBy: { studentNumber: "asc" },
  });

  return students.map((s) => {
    const report = s.weeklyReports[0];
    const hours = sumCreditedHours(report?.dailyEntries ?? []);

    const submission = report ? getLatestSubmission(report.revisionHistory) : null;
    const submittedInstant = submission ? new Date(submission.timestamp) : null;
    const submittedAt =
      submittedInstant && !Number.isNaN(submittedInstant.getTime()) ? submittedInstant : null;

    return {
      studentNumber: s.studentNumber,
      fullName: s.fullName,
      program: s.program,
      classGroup: s.classGroup.name,
      state: reportState(report),
      hours: Math.round(hours * 100) / 100,
      submittedAt: submittedAt ? formatManilaDateTime(submittedAt) : null,
      late: submittedAt ? isWeeklyReportLate(weekEnd, submittedAt) : false,
    };
  });
}

export function summarize(rows: ComplianceRow[]): {
  total: number;
  submittedThisWeek: number;
  pendingReview: number;
  notYetSubmitted: number;
} {
  return {
    total: rows.length,
    submittedThisWeek: rows.filter((r) => SUBMITTED_STATES.has(r.dueWeekState)).length,
    pendingReview: rows.reduce((sum, r) => sum + r.awaitingReview, 0),
    notYetSubmitted: rows.filter(
      (r) => r.status !== "NOT_DEPLOYED" && UNSUBMITTED_STATES.has(r.dueWeekState)
    ).length,
  };
}

// Program is filtered in the query; status is derived, so it is filtered here.
export function filterRows(
  rows: ComplianceRow[],
  filter: { status?: ComplianceStatus }
): ComplianceRow[] {
  return filter.status ? rows.filter((r) => r.status === filter.status) : rows;
}

export function summarizeByProgram(rows: ComplianceRow[]): Array<{
  program: Program;
  students: number;
  deployed: number;
  avgHoursPercent: number;
  checklistComplete: number;
  needsAttention: number;
}> {
  const byProgram = new Map<Program, ComplianceRow[]>();
  for (const row of rows) byProgram.set(row.program, [...(byProgram.get(row.program) ?? []), row]);
  return Array.from(byProgram).map(([program, group]) => ({
    program,
    students: group.length,
    deployed: group.filter((r) => r.status !== "NOT_DEPLOYED").length,
    avgHoursPercent: Math.round(group.reduce((sum, r) => sum + r.hoursPercent, 0) / group.length),
    checklistComplete: group.filter((r) => r.checklistApproved >= r.checklistTotal).length,
    needsAttention: group.filter((r) => r.status === "NEEDS_ATTENTION").length,
  }));
}

// With an id: that semester, archived or not. Without: the active one, or null
// (fresh install / between terms) so callers show an empty state instead of
// mixing every semester together.
export async function resolveDepartmentSemester(
  semesterId?: string | null
): Promise<{ id: string; name: string; archivedAt: Date | null } | null> {
  const select = { id: true, name: true, archivedAt: true } as const;
  if (semesterId) return prisma.semester.findUnique({ where: { id: semesterId }, select });
  return prisma.semester.findFirst({ where: { isActive: true }, select });
}

// Shared by every compliance screen/export. Students are refused; faculty are
// pinned to their own class groups (semester/program params ignored);
// coordinator and admin get the department scope, or null when there is no
// such/active semester so the caller can show its empty state.
export async function resolveComplianceScope(
  user: { id: string; role: Role },
  params: { semesterId?: string | null; program?: Program }
): Promise<ComplianceScope | null> {
  // Fail closed: only explicitly listed staff roles get a scope.
  if (user.role === Role.FACULTY_ADVISER) return { kind: "faculty", facultyId: user.id };
  if (user.role !== Role.SUPER_ADMIN && user.role !== Role.DEPARTMENT_COORDINATOR) {
    throw new ForbiddenError();
  }
  const semester = await resolveDepartmentSemester(params.semesterId);
  if (!semester) return null;
  return {
    kind: "department",
    semesterId: semester.id,
    ...(params.program ? { program: params.program } : {}),
  };
}
