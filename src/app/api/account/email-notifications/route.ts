import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/services/accounts/auditService";
import { handleApiError } from "@/lib/utils/apiError";

// The signed-in person's own email switch (their row only). Off keeps notices in the bell
// and inbox; email-only messages such as a password reset still go out.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const { on } = z.object({ on: z.boolean() }).parse(await req.json());
    await prisma.user.update({ where: { id: user.id }, data: { emailNotifications: on } });
    await logEvent({
      userId: user.id,
      action: on ? "EMAIL_NOTIFICATIONS_ON" : "EMAIL_NOTIFICATIONS_OFF",
      entityType: "User",
      entityId: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
