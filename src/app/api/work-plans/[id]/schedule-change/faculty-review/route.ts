import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  getWorkPlanStudentProfileId,
  validateScheduleChangeFaculty,
} from "@/lib/services/attendanceService";
import { scheduleChangeReviewSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-09 step 1: Faculty Adviser only, and only for a student they're
// assigned to.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER]);
    const studentProfileId = await getWorkPlanStudentProfileId(params.id);
    await assertCanAccessStudent(user, studentProfileId);

    const { action } = scheduleChangeReviewSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await validateScheduleChangeFaculty(params.id, user.id, action, ipAddress);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
