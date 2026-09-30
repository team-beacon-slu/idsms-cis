import { redirect } from "next/navigation";
import { FileBarChart2 } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listMonthlyReportsForStudent } from "@/lib/services/monthlyReportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="hidden shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary sm:block">
          <FileBarChart2 className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Monthly Reports</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Aggregated rollups of this student&apos;s qualifying weekly reports.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{reports.length} submitted</CardTitle>
          <CardDescription>Current month: {currentMonth}</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyReportView
            studentProfileId={params.studentProfileId}
            calendarMonth={currentMonth}
          />
        </CardContent>
      </Card>
    </div>
  );
}
