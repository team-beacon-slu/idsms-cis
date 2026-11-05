import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { connectionFor, runJob } from "@/lib/ai/jobs";
import { readWorkPlan } from "@/lib/ai/workPlanReader";
import { assertUploadable, InvalidFileError } from "@/lib/storage";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 60;

// AI assist reads the intern's uploaded work plan and suggests its rows and the company's
// days off. Nothing is stored here: the intern checks the suggestions before using them.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const { studentProfileId } = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, studentProfileId);
    const conn = await connectionFor("workplan", user);
    if (!conn) return NextResponse.json({ error: "AI assist is off" }, { status: 404 });

    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") {
      throw new InvalidFileError("Choose the work plan as a PDF");
    }
    await assertUploadable(file);
    const pdf = Buffer.from(await file.arrayBuffer());
    const suggestions = await runJob("workplan", () => readWorkPlan(conn, pdf));
    return NextResponse.json(suggestions);
  } catch (error) {
    return handleApiError(error);
  }
}
