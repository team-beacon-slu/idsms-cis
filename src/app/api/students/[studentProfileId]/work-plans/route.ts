import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { submitWorkPlanSchema } from "@/lib/validators/workPlan";
import { getWorkPlanHistory, submitWorkPlan } from "@/lib/services/workPlanService";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const history = await getWorkPlanHistory(params.studentProfileId);
    return NextResponse.json({ workPlans: history });
  } catch (error) {
    return handleApiError(error);
  }
}

// Ownership (student self-only) is enforced inside submitWorkPlan.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    const body = submitWorkPlanSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const workPlan = await submitWorkPlan(
      params.studentProfileId,
      body as { plannedTasks: Prisma.InputJsonValue; scheduleConfig?: Prisma.InputJsonValue },
      user,
      ipAddress
    );
    return NextResponse.json(workPlan, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
