import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assignAdviser } from "@/lib/services/classGroupService";
import { handleApiError } from "@/lib/utils/apiError";

export async function POST(req: NextRequest, props: { params: Promise<{ classGroupId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const created = await assignAdviser(
      params.classGroupId,
      await req.json(),
      user.id,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
