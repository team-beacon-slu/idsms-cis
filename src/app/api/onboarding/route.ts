import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { completeOwnStudentProfile } from "@/lib/services/accounts/userService";
import { getRequiredHoursConfig } from "@/lib/services/attendance/attendanceService";
import { onboardingSchema } from "@/lib/validators/user";
import { handleApiError } from "@/lib/utils/apiError";

// Beta Google sign-in: a new student sets their student number and class group.
export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const input = onboardingSchema.parse(await request.json());
    const result = await completeOwnStudentProfile(user.id, input, getRequiredHoursConfig);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
