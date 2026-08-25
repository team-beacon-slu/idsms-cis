import { NextRequest, NextResponse } from "next/server";
import { changePasswordSchema } from "@/lib/validators/auth";
import { changePassword } from "@/lib/services/userService";
import { requireUserApi, getCurrentSessionToken } from "@/lib/auth/session";
import { UnauthorizedError } from "@/lib/auth/errors";
import { handleApiError } from "@/lib/utils/apiError";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const sessionToken = getCurrentSessionToken();
    if (!sessionToken) {
      throw new UnauthorizedError();
    }

    const body = changePasswordSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    const result = await changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      sessionToken,
      ipAddress
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
