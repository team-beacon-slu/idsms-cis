import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { createSemester, listSemesters } from "@/lib/services/semesterService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// FR-DB-05: coordinators may read the semester list; only Super Admin changes it.
export async function GET() {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR]);
    return NextResponse.json({ semesters: await listSemesters() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const created = await createSemester(await req.json(), user.id);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
