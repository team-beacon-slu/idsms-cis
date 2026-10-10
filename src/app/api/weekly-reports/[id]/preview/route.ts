import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { generateReportPdfPreview, getWeeklyReport } from "@/lib/services/weeklyReportService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-09: student self-only preview before final submission.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const report = await getWeeklyReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertCanAccessStudent(user, report.studentProfileId);
    const result = await generateReportPdfPreview(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
