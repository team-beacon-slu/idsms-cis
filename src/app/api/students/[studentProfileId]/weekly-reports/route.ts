import { NextRequest, NextResponse } from "next/server";
import {
  generateWeeklyReportForm,
  listWeeklyReportsForStudent,
} from "@/lib/services/weeklyReportService";
import { weeklyReportGenerateSchema } from "@/lib/validators/report";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-01: manual "generate this week" fallback, student self-only.
export async function POST(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const { weekStart } = weeklyReportGenerateSchema.parse(await req.json());
    const result = await generateWeeklyReportForm(params.studentProfileId, weekStart);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(req: NextRequest, { params }: { params: { studentProfileId: string } }) {
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listWeeklyReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
