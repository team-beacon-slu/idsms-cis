import { NextResponse } from "next/server";

// Pass-through stub. Real RBAC + session-revocation logic (NFR-SEC-09, FR-UM-11)
// lands in Phase 1 (Module 1 — User Management & Authentication), once NextAuth's
// database session strategy is wired up. This stub exists now so the route-protection
// boundary is established from Phase 0 and every later PR touches an already-existing
// interception point instead of introducing one.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth routes)
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, public assets
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
