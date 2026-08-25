import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { createUserSchema } from "@/lib/validators/user";
import { createUser, listUsers } from "@/lib/services/userService";
import { requireUserApi, requireRole } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR]);

    const params = req.nextUrl.searchParams;
    const role = params.get("role");
    const isActive = params.get("isActive");
    const search = params.get("search");
    const page = params.get("page");
    const pageSize = params.get("pageSize");

    const result = await listUsers({
      role: role ? (role as Role) : undefined,
      isActive: isActive !== null ? isActive === "true" : undefined,
      search: search ?? undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// Creates a staff account (Coordinator/Faculty/Admin) — students only ever
// come from bulk import (FR-UM-02), never this route.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.SUPER_ADMIN]);

    const body = createUserSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    const result = await createUser(body.email, body.role, user.id, ipAddress);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
