import { NextRequest, NextResponse } from "next/server";
import { getDeviationReport, isStoragePath } from "@/lib/services/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { CHECKLIST_BUCKET, getSignedUrl } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

// Opens a deviation report's proof document. Redirects to a short-lived
// signed URL, the same server-mediated pattern as the checklist file route,
// so the private bucket is never exposed directly. Usable as a plain link.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const report = await getDeviationReport(params.id);
    await assertCanAccessStudent(user, report.studentProfileId);

    if (!report.proofUrl) {
      return NextResponse.json({ error: "No proof document attached" }, { status: 404 });
    }
    const url = isStoragePath(report.proofUrl)
      ? await getSignedUrl(CHECKLIST_BUCKET, report.proofUrl)
      : report.proofUrl;
    return NextResponse.redirect(url);
  } catch (error) {
    return handleApiError(error);
  }
}
