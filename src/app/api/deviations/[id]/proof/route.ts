import { NextRequest, NextResponse } from "next/server";
import { getDeviationReport, isStoragePath } from "@/lib/services/attendance/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { CHECKLIST_BUCKET, getSignedUrl } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

// D2/D7: proof lives in Google Classroom or Drive, so a stored link may only lead there.
const PROOF_HOSTS = ["drive.google.com", "docs.google.com", "classroom.google.com"];

function isAllowedProofLink(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && PROOF_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

// Opens a deviation report's proof document. Redirects to a short-lived
// signed URL, the same server-mediated pattern as the checklist file route,
// so the private bucket is never exposed directly. Usable as a plain link.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const report = await getDeviationReport(params.id);
    await assertCanAccessStudent(user, report.studentProfileId);

    if (!report.proofUrl) {
      return NextResponse.json({ error: "No proof document attached" }, { status: 404 });
    }
    if (isStoragePath(report.proofUrl)) {
      return NextResponse.redirect(await getSignedUrl(CHECKLIST_BUCKET, report.proofUrl));
    }
    if (!isAllowedProofLink(report.proofUrl)) {
      return NextResponse.json(
        { error: "This proof link isn't on Google Drive or Classroom, so it won't be opened" },
        { status: 400 }
      );
    }
    return NextResponse.redirect(report.proofUrl);
  } catch (error) {
    return handleApiError(error);
  }
}
