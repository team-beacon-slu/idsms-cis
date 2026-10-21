import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { updateTimeRequest } from "@/lib/services/timeRequestService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L1: the intern edits a Pending request or resubmits a Returned one.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json(
        { error: "Send JSON; files go to Google Classroom" },
        { status: 415 }
      );
    }
    await updateTimeRequest(params.id, await req.json(), user, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
