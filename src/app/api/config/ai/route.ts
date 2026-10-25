import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { previewThreshold, runGoldenEval, setAiEnabled, setThreshold } from "@/lib/ai/admin";
import { getAiSettings } from "@/lib/ai/settings";
import { setConnections, connectionsSchema, getConnections } from "@/lib/ai/connections";
import { JOB_IDS, getAiPanel, reembedAll, reenableJob, type JobId } from "@/lib/ai/jobs";
import { handleApiError } from "@/lib/utils/apiError";

const jobId = z.enum(JOB_IDS as [JobId, ...JobId[]]);
const patchSchema = z.union([
  z.object({ threshold: z.number() }),
  z.object({ enabled: z.boolean(), privacyApprovedBy: z.string().nullable() }),
  z.object({ connections: connectionsSchema }),
  z.object({ reenable: jobId }),
]);
const postSchema = z.union([
  z.object({ previewThreshold: z.number() }),
  z.object({ runTest: z.literal(true) }),
  z.object({ reembed: z.literal(true) }),
]);

async function superAdmin() {
  const user = await requireUserApi();
  requireRole(user, [Role.SUPER_ADMIN]);
  return user;
}

// AI settings, connections and the transparency panel (Super Admin only).
export async function GET() {
  try {
    await superAdmin();
    return NextResponse.json({ settings: await getAiSettings(), panel: await getAiPanel() });
  } catch (error) {
    return handleApiError(error);
  }
}

// NFR-AI-03 threshold preview; R3 golden-set test; guardrail 2 re-embedding.
export async function POST(req: NextRequest) {
  try {
    const user = await superAdmin();
    const body = postSchema.parse(await req.json());
    if ("previewThreshold" in body) {
      return NextResponse.json(await previewThreshold(body.previewThreshold));
    }
    if ("runTest" in body) return NextResponse.json(await runGoldenEval(user.id));
    const conn = (await getConnections()).private;
    if (!conn)
      return NextResponse.json({ error: "Set the private connection first" }, { status: 400 });
    await reembedAll(conn.embeddingModel, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await superAdmin();
    const body = patchSchema.parse(await req.json());
    if ("threshold" in body) return NextResponse.json(await setThreshold(body.threshold, user.id));
    if ("connections" in body) {
      await setConnections(body.connections, user.id);
      return NextResponse.json({ ok: true });
    }
    if ("reenable" in body) {
      await reenableJob(body.reenable, user.id);
      return NextResponse.json({ ok: true });
    }
    await setAiEnabled(body.enabled, body.privacyApprovedBy, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
