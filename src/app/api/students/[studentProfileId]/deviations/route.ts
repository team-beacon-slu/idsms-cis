import { NextRequest, NextResponse } from "next/server";
import { listDeviationReportsForStudent } from "@/lib/services/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Read-only legacy list. Filing moved to /api/students/[id]/time-requests
// (Workstream L1, JSON only, no uploads).
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listDeviationReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
