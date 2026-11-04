import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { requireUserApi } from "@/lib/auth/session";
import { CHECKLIST_BUCKET, getSignedUrl } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

// The uploaded work plan PDF, for the intern and the staff who can see them.
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  try {
    const user = await requireUserApi();
    const plan = await prisma.workPlan.findUniqueOrThrow({
      where: { id },
      select: { studentProfileId: true, filePath: true },
    });
    await assertCanAccessStudent(user, plan.studentProfileId);
    if (!plan.filePath) return NextResponse.json({ error: "No file uploaded" }, { status: 404 });
    return NextResponse.redirect(await getSignedUrl(CHECKLIST_BUCKET, plan.filePath));
  } catch (error) {
    return handleApiError(error);
  }
}
