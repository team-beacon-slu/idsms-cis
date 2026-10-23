import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const workPlan = await prisma.workPlan.findUniqueOrThrow({ where: { id: params.id } });
    await assertCanAccessStudent(user, workPlan.studentProfileId);
    return NextResponse.json(workPlan);
  } catch (error) {
    return handleApiError(error);
  }
}
