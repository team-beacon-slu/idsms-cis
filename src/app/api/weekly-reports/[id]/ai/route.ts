import { NextRequest, NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { getWeeklyReport } from "@/lib/services/reports/weeklyReportService";
import { processWeeklyReportAi } from "@/lib/ai/processing";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fire-and-forget hook called by the student form right after submit, so
// faculty usually see the advisory immediately; the daily cron catches up
// anything this misses. Provider failures are reported in the body, not as
// a 5xx — the submission itself already succeeded.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    const report = await getWeeklyReport(params.id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertCanAccessStudent(user, report.studentProfileId);
    try {
      return NextResponse.json(await processWeeklyReportAi(params.id));
    } catch (error) {
      console.error("AI processing failed", { weeklyReportId: params.id, error });
      return NextResponse.json({
        processed: false,
        reason: "AI provider unavailable; will retry in the daily run",
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
