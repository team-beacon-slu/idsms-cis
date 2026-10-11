import { Role, type Prisma, type Program, type WeeklyReportStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/services/userService";
import { isAwaitingReview } from "@/lib/services/weeklyReportService";
import { addDays, getWeekStartMonday, toDateKey } from "@/lib/utils/reportDeadline";

export type ReportState =
  "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "REGARDED" | "DISREGARDED";
export type ComplianceStatus = "NOT_DEPLOYED" | "NEEDS_ATTENTION" | "ON_TRACK" | "COMPLETED";
export type ComplianceScope =
  | { kind: "faculty"; facultyId: string }
  | { kind: "department"; semesterId: string; program?: Program };

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
}

const CHECKLIST_REQUIRED = 9;
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

async function scopeWhere(scope: ComplianceScope): Promise<Prisma.StudentProfileWhereInput | null> {
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
    where: { facultyId: scope.facultyId },
    select: { classGroupId: true, semesterId: true },
  });
  // Zero pairs means zero students; never send an empty `OR: []`.
  if (pairs.length === 0) return null;
  return {
    deletedAt: null,
    OR: pairs.map((p) => ({ classGroupId: p.classGroupId, semesterId: p.semesterId })),
  };
}

export async function getComplianceRows(
  scope: ComplianceScope,
  now: Date = new Date()
): Promise<ComplianceRow[]> {
  const where = await scopeWhere(scope);
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
      user: { select: { email: true } },
      classGroup: { select: { name: true } },
      company: { select: { name: true } },
      checklistItems: { select: { status: true } },
      weeklyReports: {
        select: {
          weekStart: true,
          status: true,
          revisionHistory: true,
          dailyEntries: { select: { actualHours: true } },
        },
      },
    },
    orderBy: { studentNumber: "asc" },
  });

  return students.map((s) => {
    // Same rule as calculateRenderedHours: only APPROVED + REGARDED reports count.
    let hours = 0;
    for (const report of s.weeklyReports) {
      if (!CONFIRMING_STATUSES.has(report.status)) continue;
      for (const entry of report.dailyEntries) hours += Number(entry.actualHours ?? 0);
    }
    const confirmedHours = Math.round(hours * 100) / 100;
    const hoursPercent =
      s.requiredHours > 0 ? Math.min(100, Math.round((confirmedHours / s.requiredHours) * 100)) : 0;

    const checklistApproved = s.checklistItems.filter((i) => i.status === "APPROVED").length;
    const dueWeekState = reportState(
      s.weeklyReports.find((r) => toDateKey(r.weekStart) === dueKey)
    );
    const awaitingReview = s.weeklyReports.filter((r) => isAwaitingReview(r)).length;

    let status: ComplianceStatus;
    if (!s.companyId) status = "NOT_DEPLOYED";
    else if (s.requiredHours > 0 && confirmedHours >= s.requiredHours) status = "COMPLETED";
    else if (checklistApproved < CHECKLIST_REQUIRED || UNSUBMITTED_STATES.has(dueWeekState))
      status = "NEEDS_ATTENTION";
    else status = "ON_TRACK";

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
      checklistTotal: s.checklistItems.length,
      dueWeekStart: dueKey,
      dueWeekState,
      awaitingReview,
      status,
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
    checklistComplete: group.filter((r) => r.checklistApproved >= CHECKLIST_REQUIRED).length,
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
  if (user.role === Role.STUDENT_INTERN) throw new ForbiddenError();
  if (user.role === Role.FACULTY_ADVISER) return { kind: "faculty", facultyId: user.id };
  const semester = await resolveDepartmentSemester(params.semesterId);
  if (!semester) return null;
  return {
    kind: "department",
    semesterId: semester.id,
    ...(params.program ? { program: params.program } : {}),
  };
}
