import { NextRequest, NextResponse } from "next/server";
import {
  listDeviationReportsForStudent,
  submitDeviationReport,
} from "@/lib/services/attendanceService";
import { deviationReportSchema } from "@/lib/validators/attendance";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-AT-03: submit, student self-only.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    const body = deviationReportSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await submitDeviationReport(params.studentProfileId, body, user, ipAddress);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// List, assertCanAccessStudent-gated.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listDeviationReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
