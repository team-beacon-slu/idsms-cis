import { NextRequest, NextResponse } from "next/server";
import { Program, Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import {
  getComplianceRows,
  resolveComplianceScope,
  COMPLIANCE_COLUMNS,
  toComplianceSheetRow,
} from "@/lib/services/dashboards/complianceService";
import { buildWorkbook, toSheetRows, xlsxResponse } from "@/lib/utils/excelExport";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

const querySchema = z.object({
  semesterId: z.string().uuid().optional(),
  program: z.nativeEnum(Program).optional(),
  status: z.enum(["NOT_DEPLOYED", "NEEDS_ATTENTION", "ON_TRACK", "COMPLETED"]).optional(),
});

// FR-DB-03 / FR-DB-04 / FR-DB-08: compliance spreadsheet. Faculty always get
// their own students (semesterId/program are ignored for them); coordinators
// and admins get the department view, optionally filtered. The role check
// lives in resolveComplianceScope so every compliance surface shares it.
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

    const rows = await getComplianceRows(scope);
    const filtered = query.status ? rows.filter((r) => r.status === query.status) : rows;
    const sheet = toSheetRows(filtered.map(toComplianceSheetRow), COMPLIANCE_COLUMNS);
    return xlsxResponse(buildWorkbook([{ name: "Compliance", rows: sheet }]), "compliance");
  } catch (error) {
    return handleApiError(error);
  }
}
