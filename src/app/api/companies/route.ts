import { NextRequest, NextResponse } from "next/server";
import { createCompanySchema, listCompaniesQuerySchema } from "@/lib/validators/company";
import { createCompany, listCompanies } from "@/lib/services/predeployment/companyService";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// Staff list/search the company directory; students see only their own company (the
// adviser) and find it through /api/companies/similar when registering.
export async function GET(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const { search } = listCompaniesQuerySchema.parse({
      search: req.nextUrl.searchParams.get("search") ?? undefined,
    });
    const companies = await listCompanies({ search });
    return NextResponse.json({ companies });
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-MOA-01: students and faculty (any of the 4 roles) can register a company.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    const body = createCompanySchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const company = await createCompany(body, user, ipAddress);
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
