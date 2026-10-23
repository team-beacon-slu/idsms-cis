import { NextRequest, NextResponse } from "next/server";
import { signOutOtherSessions } from "@/lib/services/userService";
import { requireUserApi, getCurrentSessionToken } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/auth/errors";
import { handleApiError } from "@/lib/utils/apiError";

// Account settings → Security: sign out every other device, keeping this one.
// Self-only: the user and the session to keep both come from the request's own cookie.
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const sessionToken = await getCurrentSessionToken();
    if (!sessionToken) {
      throw new UnauthorizedError();
    }
    const count = await signOutOtherSessions(
      user.id,
      sessionToken,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json({ signedOut: count });
  } catch (error) {
    return handleApiError(error);
  }
}
