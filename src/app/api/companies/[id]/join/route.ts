import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { joinCompany } from "@/lib/services/companyService";
import { joinCompanySchema } from "@/lib/validators/company";
import { handleApiError } from "@/lib/utils/apiError";

// Self-only: the profile comes from the session, never the request.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { positionTitle } = joinCompanySchema.parse(await req.json());
    await joinCompany(id, positionTitle, user.id, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ id });
  } catch (error) {
    return handleApiError(error);
  }
}
