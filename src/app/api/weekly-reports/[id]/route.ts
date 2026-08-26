import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  calculateRunningTotalAndRemaining,
  calculateWeeklyTotalHours,
  getDailyReportEntryWeeklyReportId,
  getWeeklyReport,
  saveDailyAccomplishment,
} from "@/lib/services/weeklyReportService";
import { dailyEntrySchema } from "@/lib/validators/report";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    const report = await getWeeklyReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertCanAccessStudent(user, report.studentProfileId);
    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}

// FR-WR-03: student self-only daily-entry write. Body must include
// `dailyReportEntryId` alongside the validated hours/accomplishments.
// `studentProfileId` for the totals recompute comes from the fetched
// report row, never the request body — a body-supplied studentProfileId
// would be spoofable. Recomputes and returns live totals (FR-WR-02) after
// every save so the client form can show an up-to-date running total
// without a page reload.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const report = await getWeeklyReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertCanAccessStudent(user, report.studentProfileId);

    const body = await req.json();
    const { dailyReportEntryId, hours, accomplishments } = dailyEntrySchema.parse(body);

    const entryWeeklyReportId = await getDailyReportEntryWeeklyReportId(dailyReportEntryId);
    if (entryWeeklyReportId !== params.id) {
      throw new ForbiddenError("This daily entry does not belong to this weekly report");
    }

    const entry = await saveDailyAccomplishment(
      dailyReportEntryId,
      hours,
      accomplishments,
      user.id
    );
    const totalHours = await calculateWeeklyTotalHours(params.id);
    const { runningTotal, remainingHours } = await calculateRunningTotalAndRemaining(
      report.studentProfileId,
      params.id
    );

    return NextResponse.json({ entry, totalHours, runningTotal, remainingHours });
  } catch (error) {
    return handleApiError(error);
  }
}
