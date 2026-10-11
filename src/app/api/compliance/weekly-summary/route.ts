import { NextRequest, NextResponse } from "next/server";
import { Program, Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import {
  getWeeklySummaryRows,
  resolveComplianceScope,
  type ReportState,
  type WeeklySummaryRow,
} from "@/lib/services/complianceService";
import { buildWorkbook, toSheetRows, xlsxResponse } from "@/lib/utils/excelExport";
import { addDays, getWeekStartMonday, toDateKey } from "@/lib/utils/reportDeadline";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

const MONDAY = 1;

// A real calendar date that falls on a Monday. Week dates are stored as UTC
// midnight calendar dates, so the UTC getters give the weekday.
const mondayDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && toDateKey(date) === value && date.getUTCDay() === MONDAY
    );
  }, "weekStart must be a Monday");

const querySchema = z.object({
  weekStart: mondayDate.optional(),
  semesterId: z.string().uuid().optional(),
  program: z.nativeEnum(Program).optional(),
});

const STATE_LABELS: Array<{ state: ReportState; label: string }> = [
  { state: "NOT_STARTED", label: "Not started" },
  { state: "DRAFT", label: "Draft" },
  { state: "SUBMITTED", label: "Submitted" },
  { state: "RETURNED", label: "Returned" },
  { state: "APPROVED", label: "Approved" },
  { state: "REGARDED", label: "Regarded" },
  { state: "DISREGARDED", label: "Disregarded" },
];

const STUDENT_COLUMNS: Array<{ key: keyof WeeklySummaryRow; header: string }> = [
  { key: "studentNumber", header: "Student number" },
  { key: "fullName", header: "Name" },
  { key: "program", header: "Program" },
  { key: "classGroup", header: "Class group" },
  { key: "state", header: "Report status" },
  { key: "hours", header: "Hours" },
  { key: "submittedAt", header: "Submitted at" },
  { key: "late", header: "Late" },
];

// FR-DB-06: weekly summary spreadsheet. Same role scoping as the compliance
// export (resolveComplianceScope): faculty see only their own class groups,
// coordinators/admins the department view, students are refused. `weekStart`
// defaults to the due week - the Monday of the most recent fully-ended
// Manila week.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR, Role.FACULTY_ADVISER]);
    const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const scope = await resolveComplianceScope(user, {
      semesterId: query.semesterId,
      program: query.program,
    });
    if (!scope) {
      return NextResponse.json({ error: "No active semester" }, { status: 404 });
    }

    const weekKey = query.weekStart ?? toDateKey(addDays(getWeekStartMonday(new Date()), -7));
    const rows = await getWeeklySummaryRows(scope, new Date(`${weekKey}T00:00:00Z`));

    const summaryRows: Array<{ measure: string; value: string | number }> = [
      { measure: "Week starting", value: weekKey },
      { measure: "Students", value: rows.length },
      {
        measure: "Total hours",
        value: Math.round(rows.reduce((sum, r) => sum + r.hours, 0) * 100) / 100,
      },
      { measure: "Late submissions", value: rows.filter((r) => r.late).length },
      ...STATE_LABELS.map(({ state, label }) => ({
        measure: label,
        value: rows.filter((r) => r.state === state).length,
      })),
    ];

    const summary = toSheetRows(summaryRows, [
      { key: "measure", header: "Measure" },
      { key: "value", header: "Value" },
    ]);
    const students = toSheetRows(
      rows.map((r) => ({ ...r, late: r.late ? "Yes" : "No" })),
      STUDENT_COLUMNS
    );
    return xlsxResponse(
      buildWorkbook([
        { name: "Summary", rows: summary },
        { name: "Students", rows: students },
      ]),
      `weekly-summary-${weekKey}`
    );
  } catch (error) {
    return handleApiError(error);
  }
}
