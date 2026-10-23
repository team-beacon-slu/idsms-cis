import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  checkMonthlyAggregationEligibility,
  listMonthlyReportsForStudent,
  submitMonthlyReport,
} from "@/lib/services/reports/monthlyReportService";
import { monthlyReportSchema } from "@/lib/validators/report";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-08: student self-only, gated by checkMonthlyAggregationEligibility.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, params.studentProfileId);
    const { calendarMonth } = monthlyReportSchema.parse(await req.json());

    const eligible = await checkMonthlyAggregationEligibility(
      params.studentProfileId,
      calendarMonth
    );
    if (!eligible) {
      return NextResponse.json(
        {
          error:
            "Every week in this month needs a weekly report that is Approved or Regarded. Check for a week you haven't started.",
        },
        { status: 400 }
      );
    }

    const ipAddress = req.headers.get("x-forwarded-for");
    const result = await submitMonthlyReport(
      params.studentProfileId,
      calendarMonth,
      user.id,
      ipAddress
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    await assertCanAccessStudent(user, params.studentProfileId);
    const reports = await listMonthlyReportsForStudent(params.studentProfileId);
    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error);
  }
}
