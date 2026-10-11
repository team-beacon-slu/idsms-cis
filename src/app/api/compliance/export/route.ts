import { NextRequest, NextResponse } from "next/server";
import { Program } from "@prisma/client";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/session";
import {
  getComplianceRows,
  resolveComplianceScope,
  type ComplianceRow,
} from "@/lib/services/complianceService";
import { buildWorkbook, toSheetRows, xlsxResponse } from "@/lib/utils/excelExport";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

const querySchema = z.object({
  semesterId: z.string().min(1).optional(),
  program: z.nativeEnum(Program).optional(),
  status: z.enum(["NOT_DEPLOYED", "NEEDS_ATTENTION", "ON_TRACK", "COMPLETED"]).optional(),
});

type ExportRecord = Record<string, unknown>;

const COLUMNS: Array<{ key: string; header: string }> = [
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

const toRecord = (r: ComplianceRow): ExportRecord => ({
  ...r,
  checklistApproved: `${r.checklistApproved}/${r.checklistTotal}`,
});

// FR-DB-03 / FR-DB-04 / FR-DB-08: compliance spreadsheet. Faculty always get
// their own students (semesterId/program are ignored for them); coordinators
// and admins get the department view, optionally filtered. The role check
// lives in resolveComplianceScope so every compliance surface shares it.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const scope = await resolveComplianceScope(user, {
      semesterId: query.semesterId,
      program: query.program,
    });
    if (!scope) {
      return NextResponse.json({ error: "No active semester" }, { status: 404 });
    }

    const rows = await getComplianceRows(scope);
    const filtered = query.status ? rows.filter((r) => r.status === query.status) : rows;
    const sheet = toSheetRows(filtered.map(toRecord), COLUMNS);
    return xlsxResponse(buildWorkbook([{ name: "Compliance", rows: sheet }]), "compliance");
  } catch (error) {
    return handleApiError(error);
  }
}
