import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { getWorkPlanHistory } from "@/lib/services/predeployment/workPlanService";
import { prisma } from "@/lib/prisma";
import { renderWorkPlanHtml } from "@/lib/documents/workPlanTemplate";
import { sluFileName } from "@/lib/documents/slu";
import { asWorkPlanRows } from "@/lib/validators/workPlan";
import { displayNameFromEmail } from "@/lib/utils/displayName";
import { withRetry, GENERATION_DEADLINE_MS } from "@/lib/services/reports/documentService";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { pdfResponse } from "@/lib/pdf/pdfResponse";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

// The latest work plan as a printable PDF, for the committee and the supervisor to sign.
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const { studentProfileId } = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, studentProfileId);
    const [history, profile] = await Promise.all([
      getWorkPlanHistory(studentProfileId),
      prisma.studentProfile.findUnique({
        where: { id: studentProfileId },
        select: {
          fullName: true,
          user: { select: { email: true } },
          company: { select: { name: true, supervisorName: true } },
        },
      }),
    ]);
    const latest = history[0];
    if (!latest || !profile) {
      return NextResponse.json({ error: "No work plan submitted yet" }, { status: 404 });
    }
    const name = profile.fullName?.trim() || displayNameFromEmail(profile.user.email);
    const html = renderWorkPlanHtml({
      student: { name },
      company: profile.company,
      rows: asWorkPlanRows(latest.plannedTasks),
      status: latest.status,
      generatedAt: new Date(),
    });
    const pdf = await withRetry(() => renderHtmlToPdf(html), {
      deadlineMs: GENERATION_DEADLINE_MS,
    });
    return pdfResponse(pdf, sluFileName({ kind: "WORK_PLAN" }, name));
  } catch (error) {
    return handleApiError(error);
  }
}
