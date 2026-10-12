import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { confirmPassword } from "@/lib/auth/confirmPassword";
import { deleteRetentionFlaggedFile } from "@/lib/services/retentionService";
import { StorageDeleteError } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// password is validated by confirmPassword (400 when missing/blank).
const bodySchema = z.object({ password: z.unknown() });

// Permanent file deletion, Super Admin only. Re-authentication (NFR-SEC-05)
// precedes any storage or database access.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const id = z.string().uuid().parse(params.id);
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const ipAddress = req.headers.get("x-forwarded-for");

    const denied = await confirmPassword(user, body.password, ipAddress);
    if (denied) return denied;

    await deleteRetentionFlaggedFile(id, user.id, ipAddress);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Storage refused the delete: the flag stays PENDING so it can be retried.
    if (error instanceof StorageDeleteError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error);
  }
}
