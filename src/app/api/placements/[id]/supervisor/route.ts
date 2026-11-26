import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { changeSupervisor } from "@/lib/services/predeployment/placementService";
import { handleApiError } from "@/lib/utils/apiError";

// A change of supervisor during the placement, from the date it happened.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireUserApi();
    const row = await changeSupervisor(id, await req.json(), user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ id: row.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
