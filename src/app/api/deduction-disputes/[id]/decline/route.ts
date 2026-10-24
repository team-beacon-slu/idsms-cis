import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { CONDUCT_STAFF_ROLES } from "@/lib/services/conduct/deductionService";
import { declineDispute } from "@/lib/services/conduct/disputeService";
import { handleApiError } from "@/lib/utils/apiError";

// Go-live item 5: staff keep the deduction and tell the intern why.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, CONDUCT_STAFF_ROLES);
    const body = await req.json().catch(() => ({}));
    await declineDispute(params.id, body.note, user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
