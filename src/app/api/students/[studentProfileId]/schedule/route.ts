import { NextRequest, NextResponse } from "next/server";
import { configureWorkSchedule, requestScheduleChange } from "@/lib/services/attendanceService";
import { scheduleChangeRequestSchema, scheduleConfigSchema } from "@/lib/validators/attendance";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-01: initial schedule config, student self-only.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    const body = scheduleConfigSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await configureWorkSchedule(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-AT-08: mid-internship schedule-change request, student self-only.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { studentProfileId: string } }
) {
  try {
    const user = await requireUserApi();
    const body = scheduleChangeRequestSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await requestScheduleChange(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
