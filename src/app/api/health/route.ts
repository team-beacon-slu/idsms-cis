import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Unauthenticated and side-effect-free: the Docker healthcheck, the deploy gate
// and an uptime monitor call it. It proves the app is up and can reach Postgres.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
