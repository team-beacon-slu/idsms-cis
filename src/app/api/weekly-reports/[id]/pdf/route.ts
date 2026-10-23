import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { getWeeklyReport } from "@/lib/services/reports/weeklyReportService";
import {
  generateWeeklyReportPdf,
  getGeneratedDocumentDownloadUrl,
  getWeeklyReportDocument,
} from "@/lib/services/reports/documentService";
import { handleApiError } from "@/lib/utils/apiError";

// Puppeteer needs the Node runtime and headroom for a cold Chrome start plus
// FR-DG-07's retries (1s+2s+4s backoff on top of each render attempt).
export const runtime = "nodejs";
export const maxDuration = 120;

async function loadAccessibleReport(id: string) {
  const user = await requireUserApi();
  const report = await getWeeklyReport(id);
  if (!report) return { user, report: null };
  await assertCanAccessStudent(user, report.studentProfileId);
  return { user, report };
}

// Download: redirect to a short-lived signed URL (private bucket).
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { report } = await loadAccessibleReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const doc = await getWeeklyReportDocument(params.id);
    if (!doc || doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "PDF not generated yet", status: doc?.status ?? null },
        { status: 404 }
      );
    }
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc));
  } catch (error) {
    return handleApiError(error);
  }
}

// Generate or regenerate. Called by the student's form right after a
// successful submit, and by the "Regenerate PDF" button (FR-DG-07). Anyone
// who can access the student may trigger it; generation itself refuses
// unsubmitted reports (FR-DG-05). A FAILED result is a normal 200 response —
// the submission is intact and the UI offers Regenerate.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user, report } = await loadAccessibleReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await generateWeeklyReportPdf(params.id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
