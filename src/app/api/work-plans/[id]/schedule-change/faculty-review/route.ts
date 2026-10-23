import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Role } from "@prisma/client";
import {
  getWorkPlanStudentProfileId,
  validateScheduleChangeFaculty,
} from "@/lib/services/attendance/attendanceService";
import { scheduleChangeReviewSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { handleApiError } from "@/lib/utils/apiError";
import { notifyScheduleChange } from "@/lib/services/notifications/notificationEvents";

// FR-AT-09 step 1: Faculty Adviser only, and only for a student they're
// assigned to.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER]);
    const studentProfileId = await getWorkPlanStudentProfileId(params.id);
    await assertCanAccessStudent(user, studentProfileId);

    const { action } = scheduleChangeReviewSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await validateScheduleChangeFaculty(params.id, user.id, action, ipAddress);
    waitUntil(
      notifyScheduleChange(
        studentProfileId,
        result.status === "PENDING_COORDINATOR" ? "PENDING_COORDINATOR" : "REJECTED"
      )
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
