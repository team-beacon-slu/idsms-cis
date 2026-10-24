import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  addCompanyHoliday,
  getHolidayCalendarForStudent,
  markHolidayApplicable,
  removeCompanyHoliday,
} from "@/lib/services/attendance/attendanceService";
import {
  companyHolidaySchema,
  holidayApplicableSchema,
  holidayEntryIdSchema,
} from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
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

// FR-AT-02: add a day off to this intern's host company (the intern or staff who can see them).
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const input = companyHolidaySchema.parse(await req.json());
    const created = await addCompanyHoliday(params.studentProfileId, input, user);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-AT-02: remove a company day off (staff, or the intern who added it).
export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const { holidayEntryId } = holidayEntryIdSchema.parse(await req.json());
    await removeCompanyHoliday(params.studentProfileId, holidayEntryId, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
