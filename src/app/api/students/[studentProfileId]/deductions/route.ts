import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { getDeductionTally, listAutomaticItems } from "@/lib/services/deductionService";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L2: the intern's tally and automatic items (intern and their staff).
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
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
