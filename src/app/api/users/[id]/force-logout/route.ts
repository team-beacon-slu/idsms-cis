import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { forceLogout } from "@/lib/services/userService";
import { requireUserApi, requireRole } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-UM-11(c)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);

    const ipAddress = req.headers.get("x-forwarded-for");
    await forceLogout(params.id, user.id, ipAddress);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
