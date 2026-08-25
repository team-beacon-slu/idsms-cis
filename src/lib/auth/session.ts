import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth/authOptions";
import { UnauthorizedError } from "@/lib/auth/errors";

// Matches next-auth's own default cookie-name logic (core/lib/cookie.js) —
// we never override `cookies` in authOptions, so this stays in sync with it.
function getSessionCookieName(): string {
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  return useSecureCookies ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

// The database-session cookie value IS the sessionToken (see authOptions.ts's
// jwt.encode override) — reading it directly is how a Route Handler identifies
// "this request's own session" versus every other active session for the user.
export function getCurrentSessionToken(): string | null {
  return cookies().get(getSessionCookieName())?.value ?? null;
}

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

// For Server Components / layouts. Middleware only checks session-cookie
// *presence* (Edge runtime can't validate a database session), so this is
// where the real per-request check happens — FR-UM-09's "service level" half.
export async function requireUserPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!user.isActive) {
    redirect("/login?error=ACCOUNT_INACTIVE");
  }
  return user;
}

// For Route Handlers — a redirect isn't appropriate here, so callers get a
// typed user or a thrown error they translate into a 401/403 response.
export async function requireUserApi() {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  if (!user.isActive) {
    throw new UnauthorizedError("Account is inactive");
  }
  return user;
}

export function requireRole(user: { role: Role }, allowedRoles: Role[]) {
  if (!allowedRoles.includes(user.role)) {
    throw new UnauthorizedError("Insufficient role");
  }
}
