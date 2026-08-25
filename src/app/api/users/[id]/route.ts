import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { updateUserSchema } from "@/lib/validators/user";
import { getUserProfile, setUserActive, ForbiddenError } from "@/lib/services/userService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();

    if (!STAFF_ROLES.includes(user.role) && user.id !== params.id) {
      throw new ForbiddenError();
    }

    const profile = await getUserProfile(params.id);
    if (!profile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenError();
    }

    const body = updateUserSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    const updated = await setUserActive(params.id, body.isActive, user.id, ipAddress);

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
