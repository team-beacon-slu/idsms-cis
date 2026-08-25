import { NextRequest, NextResponse } from "next/server";

// Matches next-auth's own default cookie-name logic (core/lib/cookie.js).
// Duplicated here rather than imported from lib/auth/session.ts, because that
// module pulls in Prisma/bcrypt through authOptions — none of which can run
// in the Edge runtime middleware executes in.
function getSessionCookieName(): string {
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  return useSecureCookies ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

// Deliberately "dumb": only checks whether a session cookie is present, not
// whether it's still valid — the Edge runtime can't reach Prisma to check a
// database session. Real authorization (role, isActive, lockedUntil,
// ownership) happens per request in Server Components/Route Handlers via
// requireUserPage()/requireUserApi() (lib/auth/session.ts) — that's the
// actual FR-UM-09 security boundary. This is a UX redirect gate only.
export function middleware(req: NextRequest) {
  const sessionCookie = req.cookies.get(getSessionCookieName());

  if (!sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (every API route handles its own auth and returns JSON
     *   401/403 — a redirect here would break that instead of gating it)
     * - login, auth/reset-password (public auth pages)
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, public assets
     */
    "/((?!api|login|auth/reset-password|_next/static|_next/image|favicon.ico).*)",
  ],
};
