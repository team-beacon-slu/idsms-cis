import { NextRequest, NextResponse } from "next/server";
import { reviewWorkPlanSchema } from "@/lib/validators/workPlan";
import { reviewWorkPlan } from "@/lib/services/workPlanService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WP-02: Coordinator/Admin only, enforced inside reviewWorkPlan itself
// (not Faculty — a narrower role set than checklist review gets).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const { action, comments } = reviewWorkPlanSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const workPlan = await reviewWorkPlan(params.id, action, comments, user, ipAddress);
    return NextResponse.json(workPlan);
  } catch (error) {
    return handleApiError(error);
  }
}
