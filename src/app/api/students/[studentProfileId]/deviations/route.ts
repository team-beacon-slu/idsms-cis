import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  buildAttendanceDocumentPath,
  listDeviationReportsForStudent,
  submitDeviationReport,
} from "@/lib/services/attendanceService";
import { deviationReportSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { CHECKLIST_BUCKET, uploadFile, validateUpload } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-03: submit, student self-only. Accepts JSON, or multipart/form-data
// when a proof file is attached (fields: date, deviationType, reason, file).
// The file is validated before anything is written and uploaded before the
// row is created, so the stored `proofUrl` always points at a real object.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, params.studentProfileId);

    let raw: Record<string, unknown>;
    let proofFile: File | null = null;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await req.formData();
      raw = {
        date: formData.get("date"),
        deviationType: formData.get("deviationType"),
        reason: formData.get("reason"),
      };
      const file = formData.get("file");
      if (file instanceof File && file.size > 0) {
        validateUpload(file);
        proofFile = file;
      }
    } else {
      raw = await req.json();
    }

    const body = deviationReportSchema.parse(raw);
    if (proofFile) {
      const path = buildAttendanceDocumentPath(
        "deviations",
        params.studentProfileId,
        proofFile.name
      );
      body.proofUrl = await uploadFile(CHECKLIST_BUCKET, path, proofFile);
    }

    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await submitDeviationReport(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// List, assertCanAccessStudent-gated.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listDeviationReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
