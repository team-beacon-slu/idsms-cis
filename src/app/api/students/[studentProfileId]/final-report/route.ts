import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { getFinalReportState, saveFinalReportDraft } from "@/lib/services/finalReportService";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream H: the intern's final report (gate + content); the intern saves drafts.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    return NextResponse.json(await getFinalReportState(params.studentProfileId));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await saveFinalReportDraft(
      params.studentProfileId,
      await req.json(),
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
