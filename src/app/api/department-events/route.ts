import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { addDepartmentEvent } from "@/lib/services/calendar/departmentEventService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// Department events on every calendar this semester (coordinator / Super Admin).
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    return NextResponse.json(await addDepartmentEvent(await req.json(), user.id), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
