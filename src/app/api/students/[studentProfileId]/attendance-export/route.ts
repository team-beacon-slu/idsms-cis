import { NextRequest, NextResponse } from "next/server";
import { exportAttendanceLogCsv } from "@/lib/services/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const csv = await exportAttendanceLogCsv(params.studentProfileId);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="attendance-${params.studentProfileId}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
