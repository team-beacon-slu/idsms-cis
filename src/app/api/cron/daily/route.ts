import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDailyNotifications } from "@/lib/services/scheduledNotifications";
import { processPendingAiReports } from "@/lib/ai/batch";

export const runtime = "nodejs";
export const maxDuration = 300;

// Constant-time comparison so response timing can't leak the secret.
function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// FR-NT-05: the only entry point for scheduled work. Any scheduler can call
// it — Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
// when CRON_SECRET is set; on the Phase 5 lab server a host cron job calls
// the same URL with the same header (portability rule 3).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isAuthorized(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDailyNotifications(new Date());
  // Workstream D: catch up AI advisories (no-op while AI is disabled).
  const ai = await processPendingAiReports();
  // Partial failure still delivered what it could; 500 makes the scheduler
  // (Vercel Cron logs / host cron exit code) surface it instead of a green run.
  return NextResponse.json({ ...result, ai }, { status: result.errors.length > 0 ? 500 : 200 });
}
