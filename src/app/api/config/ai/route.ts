import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { previewThreshold, setAiEnabled, setThreshold } from "@/lib/ai/admin";
import { getAiSettings } from "@/lib/ai/settings";
import { handleApiError } from "@/lib/utils/apiError";

const patchSchema = z.union([
  z.object({ threshold: z.number() }),
  z.object({ enabled: z.boolean(), privacyApprovedBy: z.string().nullable() }),
]);

async function superAdmin() {
  const user = await requireUserApi();
  requireRole(user, [Role.SUPER_ADMIN]);
  return user;
}

// Workstream D: AI settings (Super Admin only).
export async function GET() {
  try {
    await superAdmin();
    return NextResponse.json(await getAiSettings());
  } catch (error) {
    return handleApiError(error);
  }
}

// NFR-AI-03: preview a threshold's precision/recall before confirming it.
export async function POST(req: NextRequest) {
  try {
    await superAdmin();
    const { previewThreshold: t } = z
      .object({ previewThreshold: z.number() })
      .parse(await req.json());
    return NextResponse.json(await previewThreshold(t));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await superAdmin();
    const body = patchSchema.parse(await req.json());
    if ("threshold" in body) return NextResponse.json(await setThreshold(body.threshold, user.id));
    await setAiEnabled(body.enabled, body.privacyApprovedBy, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
