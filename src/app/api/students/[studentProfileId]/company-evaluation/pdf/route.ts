import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { getOwnEvaluationForm } from "@/lib/services/predeployment/companyEvaluationService";
import { renderHteEvaluationHtml } from "@/lib/documents/hteEvaluationTemplate";
import { sluFileName } from "@/lib/documents/slu";
import { withRetry, GENERATION_DEADLINE_MS } from "@/lib/services/reports/documentService";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { pdfResponse } from "@/lib/pdf/pdfResponse";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

// The intern's own filled-in FM-VAA-052 as a PDF (for Google Classroom and the technical
// report's appendix). Rendered on request; the service refuses anyone but the intern.
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const { studentProfileId } = await props.params;
  try {
    const user = await requireUserApi();
    const form = await getOwnEvaluationForm(studentProfileId, user);
    if (!form) return NextResponse.json({ error: "No evaluation sent yet" }, { status: 404 });
    const pdf = await withRetry(() => renderHtmlToPdf(renderHteEvaluationHtml(form)), {
      deadlineMs: GENERATION_DEADLINE_MS,
    });
    return pdfResponse(pdf, sluFileName({ kind: "HTE_EVALUATION" }, form.name));
  } catch (error) {
    return handleApiError(error);
  }
}
