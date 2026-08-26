import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { updateCompanySchema } from "@/lib/validators/company";
import { getCompany, setCompanyVerified, updateCompany } from "@/lib/services/companyService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireUserApi();
    const company = await getCompany(params.id);
    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(company);
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-MOA-06: edit/verify is staff-only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);

    const { isVerified, ...fields } = updateCompanySchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    let company = await getCompany(params.id);
    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (Object.keys(fields).length > 0) {
      company = await updateCompany(params.id, fields, user.id, ipAddress);
    }
    if (isVerified !== undefined) {
      company = await setCompanyVerified(params.id, isVerified, user.id, ipAddress);
    }

    return NextResponse.json(company);
  } catch (error) {
    return handleApiError(error);
  }
}
