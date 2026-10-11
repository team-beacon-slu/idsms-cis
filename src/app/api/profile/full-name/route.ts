import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { logEvent } from "@/lib/services/auditService";
import { handleApiError } from "@/lib/utils/apiError";

const schema = z.object({ fullName: z.string().trim().min(3, "Enter your full name").max(150) });

// FR-DG-01 needs the legal name on the endorsement letter; students set
// their own (self-only — the profile is resolved from the session, never
// from the request body).
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { fullName } = schema.parse(await req.json());
    const profile = await prisma.studentProfile.update({
      where: { userId: user.id },
      data: { fullName },
      select: { id: true, fullName: true },
    });
    await logEvent({
      userId: user.id,
      action: "PROFILE_NAME_UPDATED",
      entityType: "StudentProfile",
      entityId: profile.id,
    });
    return NextResponse.json(profile);
  } catch (error) {
    return handleApiError(error);
  }
}
