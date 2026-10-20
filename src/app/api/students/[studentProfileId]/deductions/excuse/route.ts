import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { CONDUCT_STAFF_ROLES, excuseItem } from "@/lib/services/deductionService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L2: excuse an automatic deduction item (reason code + note).
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, CONDUCT_STAFF_ROLES);
    const created = await excuseItem(
      params.studentProfileId,
      await req.json(),
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
