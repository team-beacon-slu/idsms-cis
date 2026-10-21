import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { CONDUCT_STAFF_ROLES, withdrawExcuse } from "@/lib/services/deductionService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L2: withdraw an excuse (never deleted).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, CONDUCT_STAFF_ROLES);
    await withdrawExcuse(params.id, user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
