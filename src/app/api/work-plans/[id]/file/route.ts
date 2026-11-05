import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { requireUserApi } from "@/lib/auth/session";
import { CHECKLIST_BUCKET, getSignedUrl } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";
import { logEvent } from "@/lib/services/accounts/auditService";

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
    // Data Privacy Act: a trail of who opened an intern's documents.
    await logEvent({
      userId: user.id,
      action: "FILE_ACCESSED",
      entityType: "WorkPlan",
      entityId: id,
      ipAddress: req.headers.get("x-forwarded-for"),
    });
    return NextResponse.redirect(await getSignedUrl(CHECKLIST_BUCKET, plan.filePath));
  } catch (error) {
    return handleApiError(error);
  }
}
