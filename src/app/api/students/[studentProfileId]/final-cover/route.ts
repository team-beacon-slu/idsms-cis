import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import {
  generateFinalCoverPdf,
  getFinalCoverDocument,
  getGeneratedDocumentDownloadUrl,
} from "@/lib/services/documentService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

// Anyone with access to the student can download the generated cover.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const doc = await getFinalCoverDocument(params.studentProfileId);
    if (!doc || doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "Final report cover not generated yet", status: doc?.status ?? null },
        { status: 404 }
      );
    }
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc));
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-FT-01: the student generates their own cover once over the threshold.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, params.studentProfileId);
    return NextResponse.json(await generateFinalCoverPdf(params.studentProfileId, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
