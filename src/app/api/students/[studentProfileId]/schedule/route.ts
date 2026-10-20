import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  buildAttendanceDocumentPath,
  configureWorkSchedule,
  requestScheduleChange,
} from "@/lib/services/attendanceService";
import { CHECKLIST_BUCKET, uploadFile, validateUpload } from "@/lib/storage";
import {
  scheduleChangeRequestSchema,
  scheduleConfigFromFormData,
  scheduleConfigSchema,
} from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-01: initial schedule config, student self-only.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, params.studentProfileId);
    const body = scheduleConfigSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await configureWorkSchedule(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-AT-08: mid-internship schedule-change request, student self-only.
// Accepts JSON, or multipart/form-data when a supporting document is
// attached (fields: reason, daysOfWeek (comma-separated), hoursPerDay, file).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { studentProfileId: string } }
) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, params.studentProfileId);

    let raw: unknown;
    let supportingFile: File | null = null;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await req.formData();
      raw = {
        reason: formData.get("reason"),
        newScheduleConfig: scheduleConfigFromFormData(formData),
      };
      const file = formData.get("file");
      if (file instanceof File && file.size > 0) {
        validateUpload(file);
        supportingFile = file;
      }
    } else {
      raw = await req.json();
    }

    const body = scheduleChangeRequestSchema.parse(raw);
    if (supportingFile) {
      const path = buildAttendanceDocumentPath(
        "schedule-changes",
        params.studentProfileId,
        supportingFile.name
      );
      body.supportingDocumentPath = await uploadFile(CHECKLIST_BUCKET, path, supportingFile);
    }
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await requestScheduleChange(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
