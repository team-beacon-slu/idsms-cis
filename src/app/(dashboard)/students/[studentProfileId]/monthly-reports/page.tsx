import { redirect } from "next/navigation";
import { FileBarChart2 } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import {
  checkMonthlyAggregationEligibility,
  listMonthlyReportsForStudent,
} from "@/lib/services/monthlyReportService";
import { listWeeklyReportsForStudent } from "@/lib/services/weeklyReportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyReportView, type MonthRollup } from "./monthly-report-view";

// "YYYY-MM" keys of every calendar month a week touches — a week straddling
// a month boundary counts toward both, matching the overlap rule in
// checkMonthlyAggregationEligibility.
function monthsTouched(weekStart: Date, weekEnd: Date): string[] {
  const keys = new Set([weekStart, weekEnd].map((d) => d.toISOString().slice(0, 7)));
  return Array.from(keys);
}

export default async function MonthlyReportsPage(props: {
  params: Promise<{ studentProfileId: string }>;
}) {
  const params = await props.params;
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const [weeklyReports, monthlyReports] = await Promise.all([
    listWeeklyReportsForStudent(params.studentProfileId),
    listMonthlyReportsForStudent(params.studentProfileId),
  ]);

  const byMonth = new Map<string, MonthRollup["weeklyReports"]>();
  for (const report of weeklyReports) {
    for (const key of monthsTouched(report.weekStart, report.weekEnd)) {
      const list = byMonth.get(key) ?? [];
      list.push({
        id: report.id,
        weekStart: report.weekStart.toISOString(),
        weekEnd: report.weekEnd.toISOString(),
        status: report.status,
        totalHours: Number(report.totalHours),
      });
      byMonth.set(key, list);
    }
  }

  const monthKeys = Array.from(byMonth.keys()).sort().reverse();
  const months: MonthRollup[] = await Promise.all(
    monthKeys.map(async (calendarMonth) => {
      const submitted = monthlyReports.find((m) => m.periodLabel === calendarMonth);
      return {
        calendarMonth,
        eligible: submitted
          ? true
          : await checkMonthlyAggregationEligibility(params.studentProfileId, calendarMonth),
        submitted: submitted ? { id: submitted.id, status: submitted.status } : null,
        weeklyReports: (byMonth.get(calendarMonth) ?? []).sort((a, b) =>
          a.weekStart.localeCompare(b.weekStart)
        ),
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="hidden shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary sm:block">
          <FileBarChart2 className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Monthly Reports</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Aggregated rollups of this student&apos;s qualifying weekly reports. A month can be
            submitted once every weekly report in it is Approved or Regarded.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{monthlyReports.length} submitted</CardTitle>
          <CardDescription>Months with at least one weekly report, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyReportView
            studentProfileId={params.studentProfileId}
            months={months}
            canSubmit={user.role === "STUDENT_INTERN"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
