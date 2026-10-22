import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { setRequiredChecklistTypes } from "@/lib/services/checklistService";
import { handleApiError } from "@/lib/utils/apiError";

// Super Admin chooses which checklist items gate the endorsement letter.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    const { required } = (await req.json()) as { required?: unknown };
    const saved = await setRequiredChecklistTypes(
      required,
      user.id,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json({ required: saved });
  } catch (error) {
    return handleApiError(error);
  }
}
