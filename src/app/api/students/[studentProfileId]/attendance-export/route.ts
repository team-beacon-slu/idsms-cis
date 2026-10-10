import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exportAttendanceLogCsv } from "@/lib/services/attendanceService";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    if (!z.uuid().safeParse(params.studentProfileId).success) {
      return NextResponse.json({ error: "Invalid studentProfileId" }, { status: 400 });
    }
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
