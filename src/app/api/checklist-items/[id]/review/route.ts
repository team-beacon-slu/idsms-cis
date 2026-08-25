import { NextRequest, NextResponse } from "next/server";
import { reviewChecklistItemSchema } from "@/lib/validators/checklist";
import { reviewChecklistItem } from "@/lib/services/checklistService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// Staff-only and ownership-scoped, both enforced inside reviewChecklistItem
// (it rejects STUDENT_INTERN outright, then runs assertCanAccessStudent).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const { action, comments } = reviewChecklistItemSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");
    const item = await reviewChecklistItem(params.id, action, comments, user, ipAddress);
    return NextResponse.json(item);
  } catch (error) {
    return handleApiError(error);
  }
}
