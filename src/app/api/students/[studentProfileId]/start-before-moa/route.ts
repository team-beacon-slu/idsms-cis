import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { setStartBeforeMoa } from "@/lib/services/predeployment/checklistService";
import { handleApiError } from "@/lib/utils/apiError";

// Staff only (checked in the service, with record access for faculty advisers).
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  try {
    const { studentProfileId } = await props.params;
    const user = await requireUserApi();
    await setStartBeforeMoa(
      studentProfileId,
      await req.json(),
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json({ id: studentProfileId });
  } catch (error) {
    return handleApiError(error);
  }
}
