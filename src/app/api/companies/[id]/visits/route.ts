import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { recordVisit } from "@/lib/services/predeployment/visitService";
import { handleApiError } from "@/lib/utils/apiError";

// Record SAMCIS's company visit (adviser, coordinator, admin).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireUserApi();
    const visit = await recordVisit(id, await req.json(), user, req.headers.get("x-forwarded-for"));
    return NextResponse.json(visit, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
