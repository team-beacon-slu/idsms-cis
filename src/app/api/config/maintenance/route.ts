import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { setMaintenanceNotice } from "@/lib/services/notifications/maintenanceNotice";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// NFR-REL-01: Super Admin only. An empty message clears the banner.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    return NextResponse.json(await setMaintenanceNotice(await req.json(), user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
