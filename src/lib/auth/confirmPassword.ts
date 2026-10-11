import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCredentials } from "@/lib/services/userService";

const schema = z.string().min(1);

// NFR-SEC-05 re-authentication via password re-entry. Returns null when the
// password is right; otherwise the response the caller should return.
// verifyCredentials also counts failed attempts, so repeated wrong passwords
// here can lock the account (FR-UM-10) — intended: it's the same credential.
export async function confirmPassword(
  user: { email: string },
  password: unknown,
  ip: string | null
): Promise<NextResponse | null> {
  const parsed = schema.safeParse(password);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const auth = await verifyCredentials(user.email, parsed.data, ip);
  if (auth.ok) return null;

  // The caller is already signed in, so naming the lock leaks nothing —
  // and otherwise they'd keep retrying a correct password.
  if (auth.reason === "ACCOUNT_LOCKED") {
    const until = auth.lockedUntil.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Manila",
    });
    return NextResponse.json(
      { error: `Too many failed attempts — try again after ${until}` },
      { status: 423 }
    );
  }
  return NextResponse.json({ error: "Password confirmation failed" }, { status: 401 });
}
