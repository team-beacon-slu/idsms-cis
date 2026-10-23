import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { markNotificationRead } from "@/lib/services/notifications/inbox";
import { handleApiError } from "@/lib/utils/apiError";

// Ownership is enforced by the query (scoped to the session user): a foreign
// or already-read id matches nothing and is a 404.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const updated = await markNotificationRead(user.id, params.id);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
