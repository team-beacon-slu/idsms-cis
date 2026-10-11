import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import {
  assertSignedCopyAllowed,
  attachSignedCopy,
  getCurrentSignedCopy,
  getWeeklyReport,
} from "@/lib/services/weeklyReportService";
import {
  assertFileSignature,
  CHECKLIST_BUCKET,
  getSignedUrl,
  uploadFile,
  validateUpload,
} from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

// D2: the student uploads the manager-signed scan (multipart field `file`).
// Owner only: requireRole(STUDENT) + assertCanAccessStudent (a student may
// only access their own profile).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const report = await getWeeklyReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertCanAccessStudent(user, report.studentProfileId);

    // Checked before anything is stored, so a refused upload leaves no orphan.
    const submission = assertSignedCopyAllowed(report);

    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    validateUpload(file);
    // The declared type is client-controlled; check the actual bytes too.
    await assertFileSignature(file);
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    // Keyed to the signed submission, so a resubmission's copy never
    // overwrites the evidence for an earlier one.
    const path = await uploadFile(
      CHECKLIST_BUCKET,
      `signed-copies/${report.studentProfileId}/${params.id}-${submission.referenceCode}.${ext}`,
      file
    );
    const entry = await attachSignedCopy(params.id, path, user, req.headers.get("x-forwarded-for"));
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// Student, their faculty, coordinator/admin: view the latest signed copy.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const report = await getWeeklyReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertCanAccessStudent(user, report.studentProfileId);
    const signed = getCurrentSignedCopy(report);
    if (!signed) return NextResponse.json({ error: "No signed copy uploaded" }, { status: 404 });
    return NextResponse.redirect(await getSignedUrl(CHECKLIST_BUCKET, signed.path));
  } catch (error) {
    return handleApiError(error);
  }
}
