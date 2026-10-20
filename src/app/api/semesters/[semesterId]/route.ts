import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { setSemesterWeekOne } from "@/lib/services/semesterService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// Workstream L1: coordinator or Super Admin sets the term's Week 1 start
// (body: { weekOneStart: "YYYY-MM-DD" | null }).
export async function PATCH(req: NextRequest, { params }: { params: { semesterId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR]);
    await setSemesterWeekOne(params.semesterId, await req.json(), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
