import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { activateSemester } from "@/lib/services/semesterService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// FR-DB-05: makes this the single active semester (Super Admin only).
export async function POST(_req: NextRequest, { params }: { params: { semesterId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    await activateSemester(params.semesterId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
