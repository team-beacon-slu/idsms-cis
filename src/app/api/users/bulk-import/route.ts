import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Role } from "@prisma/client";
import { bulkImportRequestSchema, bulkImportRowSchema } from "@/lib/validators/user";
import { bulkImportStudents, BulkImportInputRow } from "@/lib/services/userService";
import { parseImportFile } from "@/lib/utils/fileImport";
import { requireUserApi, requireRole } from "@/lib/auth/session";
import { notifyAccountsCreatedByEmail } from "@/lib/services/notificationEvents";
import { handleApiError } from "@/lib/utils/apiError";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR]);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const { classGroupId, semesterId } = bulkImportRequestSchema.parse({
      classGroupId: formData.get("classGroupId"),
      semesterId: formData.get("semesterId"),
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedRows = parseImportFile(buffer);

    const validRows: BulkImportInputRow[] = [];
    const rowErrors: { rowNumber: number; issues: unknown }[] = [];

    for (const parsedRow of parsedRows) {
      const validation = bulkImportRowSchema.safeParse(parsedRow.data);
      if (validation.success) {
        validRows.push({ rowNumber: parsedRow.rowNumber, row: validation.data });
      } else {
        rowErrors.push({ rowNumber: parsedRow.rowNumber, issues: validation.error.issues });
      }
    }

    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await bulkImportStudents(
      validRows,
      classGroupId,
      semesterId,
      user.id,
      ipAddress
    );
    // FR-NT-01 #1 for each created student (passwords never leave this response).
    // A class list means dozens of sequential emails — send them after the
    // response so the import can't time out on email latency.
    waitUntil(
      notifyAccountsCreatedByEmail(
        result.results.filter((r) => r.status === "created").map((r) => r.email)
      )
    );

    return NextResponse.json({
      ...result,
      totalRows: parsedRows.length,
      rowErrors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
