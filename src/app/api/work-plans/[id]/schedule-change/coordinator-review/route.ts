import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  approveScheduleChangeCoordinator,
  getWorkPlanStudentProfileId,
} from "@/lib/services/attendanceService";
import { scheduleChangeReviewSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-09 step 2: Department Coordinator/Admin only. `assertCanAccessStudent`
// always passes for these two roles (see userService.ts) — kept here anyway
// for the same reason every other student-record route keeps it: uniform
// shape, and it becomes load-bearing again if a narrower Coordinator
// scoping rule is ever introduced.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const studentProfileId = await getWorkPlanStudentProfileId(params.id);
    await assertCanAccessStudent(user, studentProfileId);

    const { action } = scheduleChangeReviewSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await approveScheduleChangeCoordinator(params.id, user.id, action, ipAddress);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
