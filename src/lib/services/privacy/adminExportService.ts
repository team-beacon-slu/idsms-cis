import { DocumentType, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  COMPLIANCE_COLUMNS,
  getComplianceRows,
  toComplianceSheetRow,
} from "@/lib/services/dashboards/complianceService";
import { listSemesters } from "@/lib/services/academic/semesterService";
import { getLatestSubmission } from "@/lib/services/reports/weeklyReportService";
import { formatManilaDateTime } from "@/lib/utils/excelExport";
import { toDateKey } from "@/lib/utils/reportDeadline";
import { CREDITED_HOURS_SELECT, entryCreditedHours } from "@/lib/utils/creditedHours";

// FR-DB bulk exports (Workstream G). Each builder is one bounded findMany with
// an explicit select (no N+1) and never selects credentials, tokens or storage
// object paths. Rows are keyed by their column header; `columns` keeps the
// header order (and the header row of an empty sheet).

export const EXPORT_KINDS = [
  "users",
  "students",
  "attendance",
  "reports",
  "checklist",
  "companies",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_LABELS: Record<ExportKind, { title: string; description: string }> = {
  users: {
    title: "Users",
    description: "Every account: email, role, active state, lockout and timestamps.",
  },
  students: {
    title: "Students",
    description: "Per-student compliance snapshot: hours, checklist, due-week report, status.",
  },
  attendance: {
    title: "Attendance",
    description: "Daily attendance with time in/out and scheduled versus actual hours.",
  },
  reports: {
    title: "Reports",
    description: "Weekly reports with submission time and reference code, plus monthly reports.",
  },
  checklist: {
    title: "Checklist",
    description: "Pre-deployment checklist status and reviewer per requirement.",
  },
  companies: {
    title: "Companies",
    description: "Partner companies with supervisor details and latest MOA status.",
  },
};

export function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value);
}

type Row = Record<string, unknown>;
export interface ExportSheet {
  name: string;
  columns: string[];
  rows: Row[];
}
export interface AdminExport {
  sheets: ExportSheet[];
  rowCount: number;
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");
const manila = (d: Date | null | undefined) => (d ? formatManilaDateTime(d) : "");
const dateKey = (d: Date | null | undefined) => (d ? toDateKey(d) : "");
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const sheet = (name: string, columns: string[], rows: Row[]): ExportSheet => ({
  name,
  columns,
  rows,
});

async function usersSheet(): Promise<ExportSheet[]> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      email: true,
      role: true,
      isActive: true,
      lockedUntil: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { email: "asc" },
  });
  const columns = ["Email", "Role", "Active", "Locked until", "Created", "Updated"];
  return [
    sheet(
      "Users",
      columns,
      users.map((u) => ({
        Email: u.email,
        Role: u.role,
        Active: yesNo(u.isActive),
        "Locked until": manila(u.lockedUntil),
        Created: manila(u.createdAt),
        Updated: manila(u.updatedAt),
      }))
    ),
  ];
}

async function studentsSheet(semesterId?: string): Promise<ExportSheet[]> {
  const headers = COMPLIANCE_COLUMNS.map((c) => c.header);
  const toRecord = (r: Parameters<typeof toComplianceSheetRow>[0]): Row => {
    const base = toComplianceSheetRow(r);
    return Object.fromEntries(COMPLIANCE_COLUMNS.map((c) => [c.header, base[c.key]]));
  };
  const now = new Date();

  if (semesterId) {
    const rows = await getComplianceRows({ kind: "department", semesterId }, now);
    return [sheet("Students", headers, rows.map(toRecord))];
  }

  // Every semester, archived included (listSemesters does not filter).
  const semesters = await listSemesters();
  const rows: Row[] = [];
  for (const s of semesters) {
    const part = await getComplianceRows({ kind: "department", semesterId: s.id }, now);
    rows.push(...part.map((r) => ({ ...toRecord(r), Semester: s.name })));
  }
  return [sheet("Students", [...headers, "Semester"], rows)];
}

// Soft-deleted students are gone from every sheet, matching the users and students sheets.
const liveStudents = (semesterId?: string) => ({
  deletedAt: null,
  ...(semesterId ? { semesterId } : {}),
});

async function attendanceSheet(semesterId?: string): Promise<ExportSheet[]> {
  const entries = await prisma.dailyReportEntry.findMany({
    where: { weeklyReport: { studentProfile: liveStudents(semesterId) } },
    select: {
      reportDate: true,
      timeIn: true,
      timeOut: true,
      ...CREDITED_HOURS_SELECT,
      weeklyReport: { select: { studentProfile: { select: { studentNumber: true } } } },
    },
    orderBy: [
      { weeklyReport: { studentProfile: { studentNumber: "asc" } } },
      { reportDate: "asc" },
    ],
  });
  const columns = [
    "Student number",
    "Date",
    "Status",
    "Time in",
    "Time out",
    "Scheduled hours",
    "Actual hours",
    "Credited hours",
  ];
  return [
    sheet(
      "Attendance",
      columns,
      entries.map((e) => ({
        "Student number": e.weeklyReport.studentProfile.studentNumber,
        Date: dateKey(e.reportDate),
        Status: e.attendanceStatus,
        "Time in": e.timeIn,
        "Time out": e.timeOut,
        "Scheduled hours": num(e.scheduledHours),
        "Actual hours": num(e.actualHours),
        "Credited hours": e.actualHours == null ? null : entryCreditedHours(e),
      }))
    ),
  ];
}

async function reportsSheets(semesterId?: string): Promise<ExportSheet[]> {
  const studentScope = { studentProfile: liveStudents(semesterId) };
  const [weekly, docs] = await Promise.all([
    prisma.weeklyReport.findMany({
      where: studentScope,
      select: {
        studentProfileId: true,
        weekStart: true,
        status: true,
        totalHours: true,
        facultyAction: true,
        revisionHistory: true,
        studentProfile: { select: { studentNumber: true } },
      },
      orderBy: [{ studentProfile: { studentNumber: "asc" } }, { weekStart: "asc" }],
    }),
    prisma.generatedDocument.findMany({
      where: {
        ...studentScope,
        documentType: { in: [DocumentType.WEEKLY_REPORT, DocumentType.MONTHLY_REPORT] },
      },
      select: {
        studentProfileId: true,
        documentType: true,
        periodLabel: true,
        referenceCode: true,
        status: true,
        studentProfile: { select: { studentNumber: true } },
      },
      orderBy: [{ studentProfile: { studentNumber: "asc" } }, { periodLabel: "asc" }],
    }),
  ]);

  const refByWeek = new Map<string, string | null>();
  for (const d of docs) {
    if (d.documentType === DocumentType.WEEKLY_REPORT && d.periodLabel) {
      refByWeek.set(`${d.studentProfileId}|${d.periodLabel}`, d.referenceCode);
    }
  }

  const weeklyRows = weekly.map((w) => {
    const week = dateKey(w.weekStart);
    const submitted = getLatestSubmission(w.revisionHistory);
    return {
      "Student number": w.studentProfile.studentNumber,
      "Week start": week,
      Status: w.status,
      "Total hours": num(w.totalHours),
      "Faculty action": w.facultyAction,
      "Submitted at": submitted ? manila(new Date(submitted.timestamp)) : "",
      "Reference code": refByWeek.get(`${w.studentProfileId}|${week}`) ?? "",
    };
  });
  const monthlyRows = docs
    .filter((d) => d.documentType === DocumentType.MONTHLY_REPORT)
    .map((d) => ({
      "Student number": d.studentProfile.studentNumber,
      Period: d.periodLabel,
      Status: d.status,
      "Reference code": d.referenceCode ?? "",
    }));

  return [
    sheet(
      "Weekly reports",
      [
        "Student number",
        "Week start",
        "Status",
        "Total hours",
        "Faculty action",
        "Submitted at",
        "Reference code",
      ],
      weeklyRows
    ),
    sheet("Monthly reports", ["Student number", "Period", "Status", "Reference code"], monthlyRows),
  ];
}

async function checklistSheet(semesterId?: string): Promise<ExportSheet[]> {
  const items = await prisma.preDeploymentChecklistItem.findMany({
    where: { studentProfile: liveStudents(semesterId) },
    select: {
      requirementType: true,
      status: true,
      reviewDate: true,
      comments: true,
      studentProfile: { select: { studentNumber: true } },
      reviewer: { select: { email: true } },
    },
    orderBy: [{ studentProfile: { studentNumber: "asc" } }, { requirementType: "asc" }],
  });
  const columns = [
    "Student number",
    "Requirement",
    "Status",
    "Reviewer email",
    "Reviewed at",
    "Comments",
  ];
  return [
    sheet(
      "Checklist",
      columns,
      items.map((i) => ({
        "Student number": i.studentProfile.studentNumber,
        Requirement: i.requirementType,
        Status: i.status,
        "Reviewer email": i.reviewer?.email ?? "",
        "Reviewed at": manila(i.reviewDate),
        Comments: i.comments,
      }))
    ),
  ];
}

async function companiesSheet(): Promise<ExportSheet[]> {
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: {
      name: true,
      address: true,
      workModality: true,
      supervisorName: true,
      supervisorPosition: true,
      isVerified: true,
      // Latest non-archived MOA by validTo, fetched in the same query.
      moaRecords: {
        where: { archivedAt: null },
        orderBy: { validTo: "desc" },
        take: 1,
        select: { status: true, validTo: true },
      },
    },
    orderBy: { name: "asc" },
  } satisfies Prisma.CompanyFindManyArgs);
  const columns = [
    "Company",
    "Address",
    "Work modality",
    "Supervisor",
    "Supervisor position",
    "Verified",
    "MOA status",
    "MOA valid to",
  ];
  return [
    sheet(
      "Companies",
      columns,
      companies.map((c) => {
        const moa = c.moaRecords[0];
        return {
          Company: c.name,
          Address: c.address,
          "Work modality": c.workModality,
          Supervisor: c.supervisorName,
          "Supervisor position": c.supervisorPosition,
          Verified: yesNo(c.isVerified),
          "MOA status": moa?.status ?? "",
          "MOA valid to": moa ? dateKey(moa.validTo) : "",
        };
      })
    ),
  ];
}

export async function buildAdminExport(
  kind: ExportKind,
  semesterId?: string
): Promise<AdminExport> {
  let sheets: ExportSheet[];
  switch (kind) {
    case "users":
      sheets = await usersSheet();
      break;
    case "students":
      sheets = await studentsSheet(semesterId);
      break;
    case "attendance":
      sheets = await attendanceSheet(semesterId);
      break;
    case "reports":
      sheets = await reportsSheets(semesterId);
      break;
    case "checklist":
      sheets = await checklistSheet(semesterId);
      break;
    case "companies":
      sheets = await companiesSheet();
      break;
  }
  return { sheets, rowCount: sheets.reduce((n, s) => n + s.rows.length, 0) };
}
