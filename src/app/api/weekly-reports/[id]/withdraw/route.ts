import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  getWeeklyReport,
  withdrawWeeklyReportSubmission,
} from "@/lib/services/reports/weeklyReportService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { handleApiError } from "@/lib/utils/apiError";

// Q21: the intern takes their own submitted week back to draft (before review and deadline).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const report = await getWeeklyReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertCanAccessStudent(user, report.studentProfileId);
    await withdrawWeeklyReportSubmission(
      params.id,
      user,
      new Date(),
      req.headers.get("x-forwarded-for")
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
