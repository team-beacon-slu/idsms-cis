import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import {
  addDailyEntry,
  calculateRunningTotalAndRemaining,
  calculateWeeklyTotalHours,
  getDailyReportEntryWeeklyReportId,
  getWeeklyReport,
  removeDailyEntry,
} from "@/lib/services/reports/weeklyReportService";
import { ForbiddenError } from "@/lib/services/accounts/userService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const bodySchema = z.object({ reportDate: z.coerce.date() });

// Workstream L1: add a non-scheduled day (e.g. a Saturday worked as OT) to a
// weekly report. Ownership, editability and the date checks live in the service.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { reportDate } = bodySchema.parse(await req.json());
    const entry = await addDailyEntry(params.id, reportDate, user.id);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

// Remove a day added by mistake (?entryId=…), then refresh the week's totals.
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const entryId = z.uuid().parse(req.nextUrl.searchParams.get("entryId"));
    if ((await getDailyReportEntryWeeklyReportId(entryId)) !== params.id) {
      throw new ForbiddenError("This daily entry does not belong to this weekly report");
    }
    await removeDailyEntry(entryId, user.id);
    const report = await getWeeklyReport(params.id);
    if (report) {
      await calculateWeeklyTotalHours(params.id);
      await calculateRunningTotalAndRemaining(report.studentProfileId, params.id);
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
