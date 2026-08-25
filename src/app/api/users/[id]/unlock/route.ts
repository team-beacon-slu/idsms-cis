import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { unlockAccount } from "@/lib/services/userService";
import { requireUserApi, requireRole } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-UM-10 manual unlock
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);

    const ipAddress = req.headers.get("x-forwarded-for");
    const updated = await unlockAccount(params.id, user.id, ipAddress);

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error);
  }
}
