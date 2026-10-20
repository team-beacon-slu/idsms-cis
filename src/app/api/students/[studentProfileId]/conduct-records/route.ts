import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import {
  CONDUCT_STAFF_ROLES,
  issueConductRecord,
  listConductRecords,
} from "@/lib/services/conductService";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Workstream L2: the intern and their staff read conduct records; staff issue them.
export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    return NextResponse.json({ records: await listConductRecords(params.studentProfileId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, CONDUCT_STAFF_ROLES);
    const created = await issueConductRecord(
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
