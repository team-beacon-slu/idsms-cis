import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  getHolidayCalendarForStudent,
  markHolidayApplicable,
} from "@/lib/services/attendanceService";
import { holidayApplicableSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-02: holiday calendar for this student's semester, with their opt-outs applied.
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const holidays = await getHolidayCalendarForStudent(params.studentProfileId);
    return NextResponse.json({ holidays });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-AT-02: student self-only toggle of whether a holiday applies to them.
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { holidayEntryId, applicable } = holidayApplicableSchema.parse(await req.json());
    const result = await markHolidayApplicable(
      params.studentProfileId,
      holidayEntryId,
      applicable,
      user
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
