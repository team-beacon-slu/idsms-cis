import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import {
  auditLogFilterSchema,
  queryAuditLogs,
  type AuditLogRow,
} from "@/lib/services/auditLogQuery";
import {
  buildWorkbook,
  formatManilaDateTime,
  toSheetRows,
  xlsxResponse,
} from "@/lib/utils/excelExport";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;
const MAX_DETAIL_CHARS = 2_000;

function detailText(detail: unknown): string {
  if (detail === null || detail === undefined) return "";
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  return text.slice(0, MAX_DETAIL_CHARS);
}

const COLUMNS: Array<{ key: keyof AuditLogRow; header: string }> = [
  { key: "timestamp", header: "Timestamp" },
  { key: "email", header: "User email" },
  { key: "name", header: "User name" },
  { key: "action", header: "Action" },
  { key: "entityType", header: "Entity type" },
  { key: "entityId", header: "Entity id" },
  { key: "ipAddress", header: "IP address" },
  { key: "detail", header: "Detail" },
];

// FR-DB-05: Super Admin audit-log spreadsheet. Detail is user-influenced
// text, so it goes through toSheetRows like every other exported cell.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const filter = auditLogFilterSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const { rows, total } = await queryAuditLogs(filter, { max: MAX_ROWS });

    const records = rows.map((r) => ({
      ...r,
      timestamp: formatManilaDateTime(r.timestamp),
      detail: detailText(r.detail),
    }));
    const sheets = [{ name: "Audit log", rows: toSheetRows(records, COLUMNS) }];
    if (total > MAX_ROWS) {
      sheets.push({
        name: "Notes",
        rows: [
          ["Note"],
          [
            `Export truncated: showing the newest ${MAX_ROWS} of ${total} matching entries. Narrow the filters to see the rest.`,
          ],
        ],
      });
    }
    return xlsxResponse(buildWorkbook(sheets), "audit-log");
  } catch (error) {
    return handleApiError(error);
  }
}
