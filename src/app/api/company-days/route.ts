import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { addCompanyDay } from "@/lib/services/calendar/companyDaysService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// Company days off: the coordinator (or Super Admin) adds one for any host company.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    return NextResponse.json(await addCompanyDay(await req.json(), user.id), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
