import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { reviewTimeRequest } from "@/lib/services/timeRequestService";
import { timeRequestReviewSchema } from "@/lib/validators/timeRequest";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// Workstream L1: Approve, or Return with a required note. The service checks
// the reviewer is assigned to the student (assertCanAccessStudent).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);
    const { action, note } = timeRequestReviewSchema.parse(await req.json());
    const result = await reviewTimeRequest(
      params.id,
      action,
      note,
      user,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
