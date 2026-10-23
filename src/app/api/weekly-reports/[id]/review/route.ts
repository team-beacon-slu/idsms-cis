import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Role } from "@prisma/client";
import {
  getWeeklyReport,
  reviewWeeklyReport_Approve,
  reviewWeeklyReport_Disregard,
  reviewWeeklyReport_Regard,
  reviewWeeklyReport_Return,
} from "@/lib/services/reports/weeklyReportService";
import { sendReportStatusEmail } from "@/lib/services/notifications/notificationService";
import { weeklyReportReviewSchema } from "@/lib/validators/report";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-06: Faculty only, and only for a student they're assigned to
// (assertCanAccessStudent's FACULTY_ADVISER branch checks
// FacultyClassGroup — same rule Phase 2's checklist review route uses).
// Dispatches on `action`.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER]);
    const report = await getWeeklyReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertCanAccessStudent(user, report.studentProfileId);

    const { action, notes } = weeklyReportReviewSchema.parse(await req.json());
    const ipAddress = req.headers.get("x-forwarded-for");

    let result;
    if (action === "APPROVE") {
      result = await reviewWeeklyReport_Approve(params.id, user.id, ipAddress);
    } else if (action === "RETURN") {
      result = await reviewWeeklyReport_Return(params.id, user.id, notes ?? "", ipAddress);
    } else if (action === "REGARD") {
      result = await reviewWeeklyReport_Regard(params.id, user.id, ipAddress);
    } else {
      result = await reviewWeeklyReport_Disregard(params.id, user.id, ipAddress);
    }

    // FR-WR-07 / FR-NT-01 #4: in-app + email to the intern and their advisers.
    waitUntil(sendReportStatusEmail(params.id, action));
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
