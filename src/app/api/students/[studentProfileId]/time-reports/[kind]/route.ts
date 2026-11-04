import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { loadTimeReportData } from "@/lib/documents/timeReportData";
import { renderTimeReportHtml, type TimeReportKind } from "@/lib/documents/timeReportTemplate";
import { sluFileName } from "@/lib/documents/slu";
import { withRetry, GENERATION_DEADLINE_MS } from "@/lib/services/reports/documentService";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { pdfResponse } from "@/lib/pdf/pdfResponse";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

const KINDS: Record<string, TimeReportKind> = {
  overtime: "OT",
  undertime: "UT",
  absences: "ABSENCE",
};

// The overtime, under time or absence report as a PDF, rendered on request from the
// requests on record (nothing stored). ?week=<weeklyReportId> for one week's report;
// without it, the whole internship (the terminal-requirement table).
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string; kind: string }> }
) {
  const { studentProfileId, kind: slug } = await props.params;
  try {
    const kind = KINDS[slug];
    if (!kind) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireUserApi();
    await assertCanAccessStudent(user, studentProfileId);
    const week = req.nextUrl.searchParams.get("week") ?? undefined;
    const data = await loadTimeReportData(studentProfileId, kind, week);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const pdf = await withRetry(() => renderHtmlToPdf(renderTimeReportHtml(data)), {
      deadlineMs: GENERATION_DEADLINE_MS,
    });
    return pdfResponse(pdf, sluFileName({ kind, week: data.week?.number }, data.student.name));
  } catch (error) {
    return handleApiError(error);
  }
}
