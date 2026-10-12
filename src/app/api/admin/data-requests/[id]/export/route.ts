import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { confirmPassword } from "@/lib/auth/confirmPassword";
import { logEvent } from "@/lib/services/auditService";
import {
  buildPersonalDataWorkbook,
  getDataRequestSubject,
} from "@/lib/services/dataRequestService";
import { buildWorkbook, xlsxResponse } from "@/lib/utils/excelExport";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 60;

// password is validated by confirmPassword (400 when missing/blank).
const bodySchema = z.object({ password: z.unknown() });

// NFR-DP-07 DSAR export, Super Admin only. Re-authentication (NFR-SEC-05)
// precedes any personal-data query, and DSAR_EXPORTED is written only once
// the workbook exists.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const id = z.string().uuid().parse(params.id);
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const ipAddress = req.headers.get("x-forwarded-for");

    const { userId } = await getDataRequestSubject(id);

    const denied = await confirmPassword(user, body.password, ipAddress);
    if (denied) return denied;

    const { sheets } = await buildPersonalDataWorkbook(userId);
    const workbook = buildWorkbook(sheets);

    await logEvent({
      userId: user.id,
      action: "DSAR_EXPORTED",
      entityType: "DataRequest",
      entityId: id,
      ipAddress,
      detail: { userId, sheets: sheets.length },
    });

    return xlsxResponse(workbook, `dsar-${id.slice(0, 8)}`);
  } catch (error) {
    return handleApiError(error);
  }
}
