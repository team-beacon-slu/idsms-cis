/** @jest-environment node */
import { NextRequest } from "next/server";
import { contentSecurityPolicy, proxy } from "@/proxy";

const get = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie: `next-auth.session-token=${cookie}` } : {},
  });

it("gives signed-in pages a fresh nonce-based script policy", () => {
  const first = proxy(get("/", "s")).headers.get("Content-Security-Policy")!;
  const second = proxy(get("/", "s")).headers.get("Content-Security-Policy")!;

  expect(first).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(first).toContain("frame-ancestors 'none'");
  expect(first).not.toEqual(second); // one nonce per request
});

it("protects the public sign-in pages too, without redirecting them", () => {
  for (const path of ["/login", "/auth/reset-password", "/auth/reset-password/abc"]) {
    const res = proxy(get(path));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("Content-Security-Policy")).toContain("'strict-dynamic'");
  }
});

it("still sends signed-out visitors of other pages to the login page", () => {
  const res = proxy(get("/students/x/weekly-reports?week=1"));

  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe(
    "http://localhost/login?callbackUrl=%2Fstudents%2Fx%2Fweekly-reports%3Fweek%3D1"
  );
});

it("allows eval only in development", () => {
  expect(contentSecurityPolicy("n", true)).toContain("'unsafe-eval'");
  expect(contentSecurityPolicy("n", false)).not.toContain("'unsafe-eval'");
});
