import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Deliberately unauthenticated and side-effect-free: the compose healthcheck,
// the deploy gate, and an external uptime monitor all hit this. It proves the
// process is up AND can reach Postgres — nothing more.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
