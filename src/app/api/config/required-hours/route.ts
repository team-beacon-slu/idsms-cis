import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Program, Role } from "@prisma/client";
import {
  getRequiredHoursConfig,
  setRequiredHoursConfig,
} from "@/lib/services/attendance/attendanceService";
import { requiredHoursConfigSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";
import { refreshWeeklyTotalsFrom } from "@/lib/services/reports/weeklyReportService";

export async function GET(req: NextRequest) {
  try {
    await requireUserApi();
    const url = new URL(req.url);
    const parsed = z.enum(Program).safeParse(url.searchParams.get("program"));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid or missing program" }, { status: 400 });
    }
    const program = parsed.data;
    const hours = await getRequiredHoursConfig(program);
    return NextResponse.json({ program, hours });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-AT-06: the coordinator or Super Admin (Q5).
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const { program, hours, applyToCurrent } = requiredHoursConfigSchema.parse(await req.json());
    const { updatedStudentIds, ...result } = await setRequiredHoursConfig(
      program,
      hours,
      user.id,
      req.headers.get("x-forwarded-for"),
      applyToCurrent
    );
    // Their stored running and remaining hours follow the new requirement.
    for (const id of updatedStudentIds) await refreshWeeklyTotalsFrom(id, new Date(0));
    return NextResponse.json({ ...result, studentsUpdated: updatedStudentIds.length });
  } catch (error) {
    return handleApiError(error);
  }
}
