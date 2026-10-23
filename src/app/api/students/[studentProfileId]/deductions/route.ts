import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { getDeductionTally, listAutomaticItems } from "@/lib/services/conduct/deductionService";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L2: the intern's tally and automatic items (intern and their staff).
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const [tally, items] = await Promise.all([
      getDeductionTally(params.studentProfileId),
      listAutomaticItems(params.studentProfileId),
    ]);
    return NextResponse.json({ tally, items });
  } catch (error) {
    return handleApiError(error);
  }
}
