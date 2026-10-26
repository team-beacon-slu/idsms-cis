import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requestPasswordResetSchema } from "@/lib/validators/auth";
import { requestPasswordReset } from "@/lib/services/accounts/userService";
import { notifyPasswordReset } from "@/lib/services/notifications/notificationEvents";
import { handleApiError } from "@/lib/utils/apiError";
import { isEmailConfigured } from "@/lib/services/notifications/notify";

// Looks up the account, issues the token and emails it. Runs after the response.
async function issueReset(email: string, ipAddress: string | null) {
  const result = await requestPasswordReset(email, ipAddress);
  if (!result) return;
  // FR-NT-01 #2 — email only; the token lives only in the email body.
  await notifyPasswordReset(result.userId, result.token);
  // Without email configured (decision D4) there is no email, so in dev
  // log the link locally — never in production; the raw token is otherwise
  // unrecoverable (only its hash is ever persisted).
  if (!isEmailConfigured() && process.env.NODE_ENV !== "production") {
    console.log(`[dev] password reset link for ${email}: /auth/reset-password/${result.token}`);
  }
}

// Public route — no auth required, and the response is identical whether or
// not the email exists (FR-UM-10: no email-enumeration leak). All account work
// (lookup, rate-limit count, token write, audit log, email) happens after the
// response, so its timing depends only on the input, never on the account.
// waitUntil keeps it alive on Vercel; on a long-lived server it just runs.
export async function POST(req: NextRequest) {
  try {
    const body = requestPasswordResetSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    waitUntil(
      issueReset(body.email, ipAddress).catch((error) =>
        console.error("[reset-password] background reset failed", error)
      )
    );

    return NextResponse.json({
      message: "If an account with that email exists, a reset link has been sent.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
