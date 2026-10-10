import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { updateMoaStatusSchema } from "@/lib/validators/company";
import { updateMoaRecordStatus } from "@/lib/services/companyService";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);

    const record = await prisma.moaRecord.findUnique({ where: { id: params.id } });
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, STAFF_ROLES);

    const { status } = updateMoaStatusSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const record = await updateMoaRecordStatus(params.id, status, user.id, ipAddress);
    return NextResponse.json(record);
  } catch (error) {
    return handleApiError(error);
  }
}
