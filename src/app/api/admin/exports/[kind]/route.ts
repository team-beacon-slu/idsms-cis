import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { confirmPassword } from "@/lib/auth/confirmPassword";
import { ComplianceNotFoundError } from "@/lib/errors/compliance";
import { buildAdminExport, isExportKind } from "@/lib/services/privacy/adminExportService";
import { logEvent } from "@/lib/services/accounts/auditService";
import { buildWorkbook, toSheetRows, xlsxResponse } from "@/lib/utils/excelExport";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 60;

// password is validated by confirmPassword (400 when missing/blank).
const bodySchema = z.object({
  password: z.unknown(),
  semesterId: z.string().uuid().optional(),
});

// FR-DB bulk export, Super Admin only. Re-authentication (NFR-SEC-05) comes
// before any query, and the audit row is written only after the export built.
export async function POST(req: NextRequest, props: { params: Promise<{ kind: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const { kind } = params;
    if (!isExportKind(kind)) throw new ComplianceNotFoundError("Unknown export");
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const ipAddress = req.headers.get("x-forwarded-for");

    const denied = await confirmPassword(user, body.password, ipAddress);
    if (denied) return denied;

    const { sheets, rowCount } = await buildAdminExport(kind, body.semesterId);
    const workbook = buildWorkbook(
      sheets.map((s) => ({
        name: s.name,
        rows: toSheetRows(
          s.rows,
          s.columns.map((c) => ({ key: c, header: c }))
        ),
      }))
    );
    await logEvent({
      userId: user.id,
      action: "DATA_EXPORTED",
      entityType: "Export",
      ipAddress,
      detail: { kind, semesterId: body.semesterId ?? null, rowCount },
    });
    return xlsxResponse(workbook, `export-${kind}`);
  } catch (error) {
    return handleApiError(error);
  }
}
