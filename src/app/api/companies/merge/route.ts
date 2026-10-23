import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { mergeCompanies } from "@/lib/services/predeployment/companyService";
import { mergeCompaniesSchema } from "@/lib/validators/company";
import { handleApiError } from "@/lib/utils/apiError";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const { keepId, mergeIds } = mergeCompaniesSchema.parse(await req.json());
    await mergeCompanies(keepId, mergeIds, user.id, req.headers.get("x-forwarded-for"));
    return NextResponse.json({ id: keepId });
  } catch (error) {
    return handleApiError(error);
  }
}
