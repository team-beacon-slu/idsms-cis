import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import { saveLearningJournal } from "@/lib/services/reports/monthlyReportService";
import { learningJournalSchema } from "@/lib/validators/report";
import { handleApiError } from "@/lib/utils/apiError";

// Save the intern's Journal on Learning Experience for a month (draft until submitted).
export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ studentProfileId: string }> }
) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    await assertCanAccessStudent(user, params.studentProfileId);
    const { calendarMonth, narrative, office } = learningJournalSchema.parse(await req.json());
    await saveLearningJournal(params.studentProfileId, calendarMonth, { narrative, office });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
