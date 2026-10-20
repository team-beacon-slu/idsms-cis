import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import {
  generateFinalTechnicalReportPdf,
  getFinalTechnicalReportDocument,
  getGeneratedDocumentDownloadUrl,
} from "@/lib/services/documentService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

// Workstream H: anyone with access to the student downloads the generated PDF.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const doc = await getFinalTechnicalReportDocument(params.studentProfileId);
    if (!doc || doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "Final report PDF not generated yet", status: doc?.status ?? null },
        { status: 404 }
      );
    }
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc));
  } catch (error) {
    return handleApiError(error);
  }
}

// The intern generates it once the coordinator has approved the report.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, params.studentProfileId);
    return NextResponse.json(
      await generateFinalTechnicalReportPdf(params.studentProfileId, user.id)
    );
  } catch (error) {
    return handleApiError(error);
  }
}
