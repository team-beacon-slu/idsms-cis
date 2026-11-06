import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { copyAdviserAssignments } from "@/lib/services/academic/classGroupService";
import { handleApiError } from "@/lib/utils/apiError";

const bodySchema = z.object({ semesterId: z.uuid("Choose a semester") });

// Efficiency item 29: copy last semester's adviser assignments into this one.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const { semesterId } = bodySchema.parse(await req.json());
    const result = await copyAdviserAssignments(
      semesterId,
      user.id,
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
