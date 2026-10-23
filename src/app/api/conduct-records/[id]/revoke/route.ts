import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { CONDUCT_STAFF_ROLES, revokeConductRecord } from "@/lib/services/conduct/conductService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L2: revoke a conduct record with a reason (never deleted).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, CONDUCT_STAFF_ROLES);
    const { reason } = z.object({ reason: z.string() }).parse(await req.json());
    await revokeConductRecord(params.id, reason, user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
