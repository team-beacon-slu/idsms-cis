import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listWeeklyReportsForStudent } from "@/lib/services/weeklyReportService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyReportForm } from "./weekly-report-form";

export default async function WeeklyReportsPage({
  params,
}: {
  params: { studentProfileId: string };
}) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const reports = await listWeeklyReportsForStudent(params.studentProfileId);
  const isOwner = user.role === "STUDENT_INTERN";
  const canReview = !isOwner;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Reports ({reports.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.map((report) => (
          <div key={report.id} className="space-y-2">
            <WeeklyReportForm weeklyReportId={report.id} />
            {canReview && (
              <Link
                href={`/students/${params.studentProfileId}/weekly-reports/${report.id}/review`}
                className="text-sm underline"
              >
                Review
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
