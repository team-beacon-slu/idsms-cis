import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import {
  generateEndorsementLetterPdf,
  getEndorsementLetterDocument,
  getGeneratedDocumentDownloadUrl,
} from "@/lib/services/documentService";
import { notifyEndorsementReady } from "@/lib/services/notificationEvents";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const doc = await getEndorsementLetterDocument(params.studentProfileId);
    if (!doc || doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "Endorsement letter not generated yet", status: doc?.status ?? null },
        { status: 404 }
      );
    }
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc));
  } catch (error) {
    return handleApiError(error);
  }
}

// Staff-only: the department issues the endorsement, not the student.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN, Role.FACULTY_ADVISER]);
    await assertCanAccessStudent(user, params.studentProfileId);
    const result = await generateEndorsementLetterPdf(params.studentProfileId, user.id);
    if (result.status === "GENERATED") {
      await notifyEndorsementReady(params.studentProfileId); // FR-NT-01 #7
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
