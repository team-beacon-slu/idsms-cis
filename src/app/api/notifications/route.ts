import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { listNotifications, markAllRead } from "@/lib/services/inbox";
import { handleApiError } from "@/lib/utils/apiError";

// The caller's own in-app inbox — always the session user, never a body id.
export async function GET() {
  try {
    const user = await requireUserApi();
    return NextResponse.json(await listNotifications(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH() {
  try {
    const user = await requireUserApi();
    const { count } = await markAllRead(user.id);
    return NextResponse.json({ updated: count });
  } catch (error) {
    return handleApiError(error);
  }
}
