import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { fileRetraction } from "@/lib/services/predeployment/placementService";
import { handleApiError } from "@/lib/utils/apiError";

// The intern's notification of retraction for their current host company.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const { studentProfileId } = await props.params;
  try {
    const user = await requireUserApi();
    const result = await fileRetraction(
      studentProfileId,
      await req.json(),
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
