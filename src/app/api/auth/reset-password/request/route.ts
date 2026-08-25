import { NextRequest, NextResponse } from "next/server";
import { requestPasswordResetSchema } from "@/lib/validators/auth";
import { requestPasswordReset } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Public route — no auth required, and the response is identical whether or
// not the email exists (FR-UM-10: no email-enumeration leak).
export async function POST(req: NextRequest) {
  try {
    const body = requestPasswordResetSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    const result = await requestPasswordReset(body.email, ipAddress);

    // TODO(Phase 4): send the magic link via notificationService/Resend once
    // that integration lands. Until then, log it locally so the reset flow
    // can be exercised in dev — this never runs in production and the raw
    // token is otherwise unrecoverable (only its hash is ever persisted).
    if (result && process.env.NODE_ENV !== "production") {
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
