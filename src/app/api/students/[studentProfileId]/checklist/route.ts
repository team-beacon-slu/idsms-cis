import { NextRequest, NextResponse } from "next/server";
import { getChecklistProgress } from "@/lib/services/checklistService";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);

    const progress = await getChecklistProgress(params.studentProfileId);
    return NextResponse.json(progress);
  } catch (error) {
    return handleApiError(error);
  }
}
