import { NextRequest, NextResponse } from "next/server";
import { getChecklistProgress } from "@/lib/services/predeployment/checklistService";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);

    const progress = await getChecklistProgress(params.studentProfileId);
    return NextResponse.json(progress);
  } catch (error) {
    return handleApiError(error);
  }
}
