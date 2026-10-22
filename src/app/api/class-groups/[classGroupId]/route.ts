import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { deleteClassGroup, renameClassGroup } from "@/lib/services/classGroupService";
import { handleApiError } from "@/lib/utils/apiError";

const MANAGERS: Role[] = [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ classGroupId: string }> }
) {
  try {
    const { classGroupId } = await props.params;
    const user = await requireUserApi();
    requireRole(user, MANAGERS);
    await renameClassGroup(
      classGroupId,
      await req.json(),
      user.id,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json({ id: classGroupId });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ classGroupId: string }> }
) {
  try {
    const { classGroupId } = await props.params;
    const user = await requireUserApi();
    requireRole(user, MANAGERS);
    await deleteClassGroup(classGroupId, user.id, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ id: classGroupId });
  } catch (error) {
    return handleApiError(error);
  }
}
