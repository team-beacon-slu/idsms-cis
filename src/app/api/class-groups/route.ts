import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { createClassGroup } from "@/lib/services/classGroupService";
import { handleApiError } from "@/lib/utils/apiError";

const MANAGERS: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, MANAGERS);
    const created = await createClassGroup(
      await req.json(),
      user.id,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
