import { redirect } from "next/navigation";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Reports ({reports.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reports.map((report) => (
          <WeeklyReportForm key={report.id} weeklyReportId={report.id} />
        ))}
      </CardContent>
    </Card>
  );
}
