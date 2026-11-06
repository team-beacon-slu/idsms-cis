import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { addSuspensionDay } from "@/lib/services/calendar/suspensionService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// Q14: the coordinator (or Super Admin) records a university suspension day.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    return NextResponse.json(await addSuspensionDay(await req.json(), user.id), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
