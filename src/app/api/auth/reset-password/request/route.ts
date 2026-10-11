import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requestPasswordResetSchema } from "@/lib/validators/auth";
import { requestPasswordReset } from "@/lib/services/userService";
import { notifyPasswordReset } from "@/lib/services/notificationEvents";
import { handleApiError } from "@/lib/utils/apiError";

// Public route — no auth required, and the response is identical whether or
// not the email exists (FR-UM-10: no email-enumeration leak).
export async function POST(req: NextRequest) {
  try {
    const body = requestPasswordResetSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    const result = await requestPasswordReset(body.email, ipAddress);

    if (result) {
      // FR-NT-01 #2 — email only; the token lives only in the email body.
      // Sent after the response: awaiting it would make "account exists"
      // measurably slower than "no account" (enumeration by timing).
      // waitUntil keeps it alive on Vercel; on a long-lived server it just runs.
      waitUntil(notifyPasswordReset(result.userId, result.token));
    }
    // Without Resend configured (decision D4) there is no email, so in dev
    // log the link locally — never in production; the raw token is otherwise
    // unrecoverable (only its hash is ever persisted).
    const emailConfigured = !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
    if (result && !emailConfigured && process.env.NODE_ENV !== "production") {
      console.log(
        `[dev] password reset link for ${body.email}: /auth/reset-password/${result.token}`
      );
    }

    return NextResponse.json({
      message: "If an account with that email exists, a reset link has been sent.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
