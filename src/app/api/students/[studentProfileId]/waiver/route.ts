import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { renderWaiverHtml } from "@/lib/documents/waiverTemplate";
import { nameParts } from "@/lib/documents/slu";
import { displayNameFromEmail } from "@/lib/utils/displayName";
import { withRetry, GENERATION_DEADLINE_MS } from "@/lib/services/reports/documentService";
import { renderHtmlToPdf } from "@/lib/pdf/renderHtmlToPdf";
import { pdfResponse } from "@/lib/pdf/pdfResponse";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

// SAMCIS's parental consent, waiver and undertaking, prefilled for the intern to print.
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const { studentProfileId } = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, studentProfileId);
    const p = await prisma.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: {
        fullName: true,
        program: true,
        user: { select: { email: true } },
        company: { select: { name: true, address: true } },
        semester: { select: { name: true, academicYear: true } },
      },
    });
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const name = p.fullName?.trim() || displayNameFromEmail(p.user.email);
    const html = renderWaiverHtml({
      student: { name, program: p.program },
      company: p.company,
      term: `${p.semester.name}, SY ${p.semester.academicYear}`,
    });
    const pdf = await withRetry(() => renderHtmlToPdf(html), {
      deadlineMs: GENERATION_DEADLINE_MS,
    });
    const { last, first } = nameParts(name);
    return pdfResponse(pdf, `Waiver ${last}${first}.pdf`);
  } catch (error) {
    return handleApiError(error);
  }
}
