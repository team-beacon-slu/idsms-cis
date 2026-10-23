import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserApi } from "@/lib/auth/session";
import { logEvent } from "@/lib/services/accounts/auditService";
import { handleApiError } from "@/lib/utils/apiError";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy";

const schema = z.object({ agree: z.boolean() });

// FR-CK-05 / NFR-DP-03: both answers are logged; declining signs the user out
// client-side, and the notice comes back on the next login.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const { agree } = schema.parse(await req.json());
    if (agree) {
      await prisma.user.update({
        where: { id: user.id },
        data: { privacyConsentAt: new Date(), privacyConsentVersion: PRIVACY_NOTICE_VERSION },
      });
    }
    await logEvent({
      userId: user.id,
      action: agree ? "PRIVACY_CONSENT_GIVEN" : "PRIVACY_CONSENT_DECLINED",
      entityType: "User",
      entityId: user.id,
      ipAddress: req.headers.get("x-forwarded-for"),
      detail: { version: PRIVACY_NOTICE_VERSION },
    });
    return NextResponse.json({ agree });
  } catch (error) {
    return handleApiError(error);
  }
}
