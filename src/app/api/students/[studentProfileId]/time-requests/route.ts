import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { createTimeRequest, listTimeRequests } from "@/lib/services/timeRequestService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L1: the intern's leave / OT / UT requests. JSON only — no
// uploads (D2/D7); proof goes to Google Classroom.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    return NextResponse.json({ requests: await listTimeRequests(params.studentProfileId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json(
        { error: "Send JSON; files go to Google Classroom" },
        { status: 415 }
      );
    }
    const result = await createTimeRequest(
      params.studentProfileId,
      await req.json(),
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
