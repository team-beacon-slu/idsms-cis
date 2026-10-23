import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { archiveSemester } from "@/lib/services/academic/semesterService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// FR-DB-07: non-destructive archive (Super Admin only).
export async function POST(_req: NextRequest, props: { params: Promise<{ semesterId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    await archiveSemester(params.semesterId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
