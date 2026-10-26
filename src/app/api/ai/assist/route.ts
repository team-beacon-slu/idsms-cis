import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { handleApiError } from "@/lib/utils/apiError";

// The signed-in person's own AI assist switch (their row only).
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const { on } = z.object({ on: z.boolean() }).parse(await req.json());
    await prisma.user.update({ where: { id: user.id }, data: { aiAssist: on } });
    await logEvent({
      userId: user.id,
      action: on ? "AI_ASSIST_ON" : "AI_ASSIST_OFF",
      entityType: "User",
      entityId: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
