import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { submitWorkPlanSchema } from "@/lib/validators/workPlan";
import { getWorkPlanHistory, submitWorkPlan } from "@/lib/services/predeployment/workPlanService";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";
import { randomUUID } from "crypto";
import { z } from "zod";
import { CHECKLIST_BUCKET, uploadFile } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const history = await getWorkPlanHistory(params.studentProfileId);
    return NextResponse.json({ workPlans: history });
  } catch (error) {
    return handleApiError(error);
  }
}

// Access is checked before any file is stored (and again inside submitWorkPlan). Multipart carries the
// company's own work plan PDF ("file") with the rows as JSON ("plan"); either may be empty,
// not both.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    // Before the upload: otherwise anyone signed in could leave files under another student.
    z.uuid().parse(params.studentProfileId);
    await assertCanAccessStudent(user, params.studentProfileId);
    let raw: unknown;
    let file: File | null = null;
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await req.formData();
      raw = JSON.parse(String(form.get("plan") ?? "{}"));
      const upload = form.get("file");
      file = upload instanceof File && upload.size > 0 ? upload : null;
    } else {
      raw = await req.json();
    }
    const body = submitWorkPlanSchema.parse(raw);
    if (!file && body.plannedTasks.length === 0) {
      return NextResponse.json(
        { error: "Upload your work plan or add at least one row" },
        { status: 400 }
      );
    }
    // Stored before the row so a failed upload leaves no plan pointing at nothing.
    const filePath = file
      ? await uploadFile(
          CHECKLIST_BUCKET,
          `work-plans/${params.studentProfileId}/${randomUUID()}.pdf`,
          file
        )
      : null;
    const ipAddress = req.headers.get("x-forwarded-for");
    const workPlan = await submitWorkPlan(
      params.studentProfileId,
      body as { plannedTasks: Prisma.InputJsonValue; scheduleConfig?: Prisma.InputJsonValue },
      user,
      ipAddress,
      filePath
    );
    return NextResponse.json(workPlan, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
