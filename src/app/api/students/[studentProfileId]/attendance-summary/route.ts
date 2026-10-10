import { NextRequest, NextResponse } from "next/server";
import {
  computeProjectedCompletionDate,
  computeTotalHoursRendered,
} from "@/lib/services/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const [renderedHours, projectedCompletionDate] = await Promise.all([
      computeTotalHoursRendered(params.studentProfileId),
      computeProjectedCompletionDate(params.studentProfileId),
    ]);
    return NextResponse.json({ renderedHours, projectedCompletionDate });
  } catch (error) {
    return handleApiError(error);
  }
}
