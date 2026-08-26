import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyReportReviewActions } from "./review-actions";

// Ownership note (pre-flight fix): a role check alone isn't enough — a
// Faculty Adviser must also be assigned to this specific student (same
// FacultyClassGroup rule every other review surface in this plan enforces).
export default async function WeeklyReportReviewPage({
  params,
}: {
  params: { studentProfileId: string; weeklyReportId: string };
}) {
  const user = await requireUserPage();
  if (user.role !== Role.FACULTY_ADVISER) {
    redirect("/");
  }

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const report = await getWeeklyReport(params.weeklyReportId);
  if (!report) {
    redirect(`/students/${params.studentProfileId}/weekly-reports`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Weekly Report — {report!.status}</CardTitle>
      </CardHeader>
      <CardContent>
        <WeeklyReportReviewActions weeklyReportId={params.weeklyReportId} />
      </CardContent>
    </Card>
  );
}
