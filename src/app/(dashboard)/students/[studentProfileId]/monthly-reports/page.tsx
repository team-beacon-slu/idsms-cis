import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listMonthlyReportsForStudent } from "@/lib/services/monthlyReportService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyReportView } from "./monthly-report-view";

export default async function MonthlyReportsPage({
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

  const reports = await listMonthlyReportsForStudent(params.studentProfileId);
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Reports ({reports.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <MonthlyReportView
          studentProfileId={params.studentProfileId}
          calendarMonth={currentMonth}
        />
      </CardContent>
    </Card>
  );
}
