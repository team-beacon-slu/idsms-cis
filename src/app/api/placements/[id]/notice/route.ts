import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { renderRetractionHtml } from "@/lib/documents/retractionTemplate";
import { nameParts } from "@/lib/documents/slu";
import { displayNameFromEmail } from "@/lib/utils/displayName";
import { withRetry, GENERATION_DEADLINE_MS } from "@/lib/services/reports/documentService";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { pdfResponse } from "@/lib/pdf/pdfResponse";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

// The intern's notification of retraction as a PDF, for the intern and the staff who see them.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireUserApi();
    const p = await prisma.companyPlacement.findUnique({
      where: { id },
      include: {
        company: { select: { name: true, address: true, supervisorName: true } },
        studentProfile: {
          select: {
            fullName: true,
            studentNumber: true,
            program: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    if (!p?.retractionFiledAt || !p.retractionLastDay || !p.retractionReason) {
      return NextResponse.json({ error: "No notification of retraction" }, { status: 404 });
    }
    await assertCanAccessStudent(user, p.studentProfileId);
    const noter = p.retractionNotedById
      ? await prisma.user.findUnique({
          where: { id: p.retractionNotedById },
          select: { fullName: true, email: true },
        })
      : null;
    const name =
      p.studentProfile.fullName?.trim() || displayNameFromEmail(p.studentProfile.user.email);
    const html = renderRetractionHtml({
      student: {
        name,
        studentNumber: p.studentProfile.studentNumber,
        program: p.studentProfile.program,
      },
      company: p.company,
      startedOn: p.startedOn,
      lastDay: p.retractionLastDay,
      reason: p.retractionReason,
      filedAt: p.retractionFiledAt,
      notedAt: p.retractionNotedAt,
      notedBy: noter ? noter.fullName?.trim() || noter.email : null,
    });
    const pdf = await withRetry(() => renderHtmlToPdf(html), {
      deadlineMs: GENERATION_DEADLINE_MS,
    });
    const { last, first } = nameParts(name);
    return pdfResponse(pdf, `Retraction ${last}${first}.pdf`);
  } catch (error) {
    return handleApiError(error);
  }
}
