import { NextRequest, NextResponse } from "next/server";

// Matches next-auth's own default cookie-name logic (core/lib/cookie.js).
// Duplicated here rather than imported from lib/auth/session.ts, because that
// module pulls in Prisma/bcrypt through authOptions — none of which can run
// in this tiny proxy that runs before every page request.
function getSessionCookieName(): string {
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  return useSecureCookies ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

// Pages anyone may open; they still get the CSP below.
const PUBLIC_PATHS = ["/login", "/auth/reset-password"];
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

// Only scripts carrying this request's nonce run (Next adds it to its own scripts),
// and 'strict-dynamic' lets them load the rest: an injected <script> can't run.
// Styles stay 'unsafe-inline': React style={} attributes can't carry a nonce, and a
// nonce in style-src would switch 'unsafe-inline' off. No upgrade-insecure-requests,
// so an admin can still reach the lab server over plain LAN http.
export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// The session check is deliberately "dumb": only whether a session cookie is
// present, not whether it's still valid, so it never touches the database.
// Validating the session here would add a DB round trip to every page. Real
// authorization (role, isActive, lockedUntil, ownership) happens per request in
// Server Components/Route Handlers via requireUserPage()/requireUserApi()
// (lib/auth/session.ts) — that's the actual FR-UM-09 security boundary. This is a
// UX redirect gate only.
export function proxy(req: NextRequest) {
  if (!isPublic(req.nextUrl.pathname) && !req.cookies.get(getSessionCookieName())) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  // Next reads the policy from the request to put the nonce on its own scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Every page, except:
     * - api (every API route handles its own auth and returns JSON
     *   401/403 — a redirect here would break that instead of gating it)
     * - _next/static, _next/image, favicon.ico (static files need no CSP)
     * - <Link> prefetches, which render nothing themselves
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
