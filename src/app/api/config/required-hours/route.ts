import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Program, Role } from "@prisma/client";
import { getRequiredHoursConfig, setRequiredHoursConfig } from "@/lib/services/attendanceService";
import { requiredHoursConfigSchema } from "@/lib/validators/attendance";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

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

// FR-AT-06: Super Admin only.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const { program, hours } = requiredHoursConfigSchema.parse(await req.json());
    const result = await setRequiredHoursConfig(program, hours, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
