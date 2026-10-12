import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { keepRetentionFlag } from "@/lib/services/retentionService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";

// NFR-DP-08: keeping a flagged file changes nothing in storage, so no password.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const id = z.string().uuid().parse(params.id);
    await keepRetentionFlag(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
