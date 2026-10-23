import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import {
  getNotificationSettings,
  setNotificationSettings,
} from "@/lib/services/notifications/scheduledNotifications";
import { handleApiError } from "@/lib/utils/apiError";

// FR-NT-02: reminder intervals. Staff can read; only the Super Admin changes them.
export async function GET() {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR, Role.FACULTY_ADVISER]);
    return NextResponse.json(await getNotificationSettings());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);
    return NextResponse.json(await setNotificationSettings(await req.json(), user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
