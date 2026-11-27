import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { addCustomRequirement } from "@/lib/services/predeployment/customRequirementService";
import { handleApiError } from "@/lib/utils/apiError";

// Coordinator or Super Admin adds a checklist requirement beyond the built-in ones.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const created = await addCustomRequirement(
      await req.json(),
      user.id,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
