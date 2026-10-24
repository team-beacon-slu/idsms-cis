import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { disputeDeduction } from "@/lib/services/conduct/disputeService";
import { handleApiError } from "@/lib/utils/apiError";

// Go-live item 5: the intern disputes a deduction (the service checks the role).
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const created = await disputeDeduction(
      params.studentProfileId,
      await req.json(),
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
