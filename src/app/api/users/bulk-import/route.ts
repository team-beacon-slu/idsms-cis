import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Role } from "@prisma/client";
import { bulkImportRequestSchema, bulkImportRowSchema } from "@/lib/validators/user";
import {
  bulkImportStudents,
  BulkImportInputRow,
  previewBulkImport,
} from "@/lib/services/accounts/userService";
import { prisma } from "@/lib/prisma";
import { parseImportFile } from "@/lib/utils/fileImport";
import { requireUserApi, requireRole } from "@/lib/auth/session";
import { notifyAccountsCreatedByEmail } from "@/lib/services/notifications/notificationEvents";
import { handleApiError } from "@/lib/utils/apiError";

// A class list is a few hundred rows; anything far larger is a mistake, and
// parsing it would hold the whole workbook in memory.
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR]);

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: "File exceeds the 2MB limit" }, { status: 413 });
    }

    const { classGroupId, semesterId } = bulkImportRequestSchema.parse({
      classGroupId: formData.get("classGroupId"),
      semesterId: formData.get("semesterId"),
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsedRows = parseImportFile(buffer);

    const validRows: BulkImportInputRow[] = [];
    const rowErrors: { rowNumber: number; issues: unknown }[] = [];
    // A class group column names sections; match them case-insensitively.
    const groups = await prisma.classGroup.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    const groupId = new Map(groups.map((g) => [g.name.trim().toUpperCase(), g.id]));

    for (const parsedRow of parsedRows) {
      const validation = bulkImportRowSchema.safeParse(parsedRow.data);
      if (!validation.success) {
        rowErrors.push({ rowNumber: parsedRow.rowNumber, issues: validation.error.issues });
        continue;
      }
      const name = validation.data.classGroup;
      const rowGroupId = name ? groupId.get(name.toUpperCase()) : undefined;
      if (name && !rowGroupId) {
        rowErrors.push({
          rowNumber: parsedRow.rowNumber,
          issues: [{ path: ["classGroup"], message: `No class group named "${name}"` }],
        });
        continue;
      }
      validRows.push({
        rowNumber: parsedRow.rowNumber,
        row: validation.data,
        classGroupId: rowGroupId,
      });
    }

    if (formData.get("preview") === "1") {
      const preview = await previewBulkImport(validRows);
      return NextResponse.json({
        ...preview,
        preview: true,
        totalRows: parsedRows.length,
        rowErrors,
      });
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
