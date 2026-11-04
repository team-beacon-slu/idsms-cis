import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { noteRetraction } from "@/lib/services/predeployment/placementService";
import { handleApiError } from "@/lib/utils/apiError";

// SAMCIS notes an intern's retraction: the placement ends and the intern may move on.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireUserApi();
    await noteRetraction(id, user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
