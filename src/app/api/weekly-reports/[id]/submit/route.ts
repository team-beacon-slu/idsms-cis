import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  generateReportReferenceCode,
  getWeeklyReport,
  recordWeeklyReportSubmission,
  validateLateSubmissionReason,
} from "@/lib/services/weeklyReportService";
import { weeklyReportSubmitSchema } from "@/lib/validators/report";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/userService";
import { handleApiError } from "@/lib/utils/apiError";

// FR-WR-05 + FR-WR-10: student self-only. The late-reason gate runs first so
// no reference code is issued for a submission that will be rejected.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const report = await getWeeklyReport(params.id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertCanAccessStudent(user, report.studentProfileId);

    const { reasonForDelay } = weeklyReportSubmitSchema.parse(await req.json());
    await validateLateSubmissionReason(params.id, reasonForDelay);
    const { referenceCode, timestamp } = await generateReportReferenceCode(params.id);
    const ipAddress = req.headers.get("x-forwarded-for");
    const submission = await recordWeeklyReportSubmission(
      params.id,
      { referenceCode, timestamp, reasonForDelay },
      user,
      ipAddress
    );
    return NextResponse.json({ referenceCode, timestamp, late: submission.late }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
