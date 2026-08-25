import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { CHECKLIST_BUCKET, getSignedUrl } from "@/lib/storage";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();

    const item = await prisma.preDeploymentChecklistItem.findUniqueOrThrow({
      where: { id: params.id },
    });
    await assertCanAccessStudent(user, item.studentProfileId);

    if (!item.filePath) {
      return NextResponse.json({ error: "No file uploaded for this item" }, { status: 404 });
    }

    const signedUrl = await getSignedUrl(CHECKLIST_BUCKET, item.filePath);
    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    return handleApiError(error);
  }
}
