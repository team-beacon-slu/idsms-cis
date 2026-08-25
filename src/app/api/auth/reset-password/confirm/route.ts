import { NextRequest, NextResponse } from "next/server";
import { completePasswordResetSchema } from "@/lib/validators/auth";
import { completePasswordReset } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Public route — the token itself is the credential.
export async function POST(req: NextRequest) {
  try {
    const body = completePasswordResetSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    const result = await completePasswordReset(body.token, body.newPassword, ipAddress);

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
