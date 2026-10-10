import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  getDeviationReportStudentProfileId,
  validateDeviationReport,
} from "@/lib/services/attendanceService";
import { deviationValidateSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// FR-AT-04: Faculty/Coordinator/Admin only, and only for a student they're
// assigned to (Faculty) or always (Coordinator/Admin) — see
// assertCanAccessStudent in userService.ts.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);
    const studentProfileId = await getDeviationReportStudentProfileId(params.id);
    await assertCanAccessStudent(user, studentProfileId);

    const { action } = deviationValidateSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await validateDeviationReport(params.id, user.id, action, ipAddress);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
