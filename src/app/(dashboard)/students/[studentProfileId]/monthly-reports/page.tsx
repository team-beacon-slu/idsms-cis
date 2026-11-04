import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import {
  checkMonthlyAggregationEligibility,
  listLearningJournals,
  listMonthlyReportsForStudent,
} from "@/lib/services/reports/monthlyReportService";
import { listWeeklyReportsForStudent } from "@/lib/services/reports/weeklyReportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { MonthlyReportView, type MonthRollup } from "./monthly-report-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Monthly reports" };

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

  const [weeklyReports, monthlyReports, journals, profile] = await Promise.all([
    listWeeklyReportsForStudent(params.studentProfileId),
    listMonthlyReportsForStudent(params.studentProfileId),
    listLearningJournals(params.studentProfileId),
    prisma.studentProfile.findUnique({
      where: { id: params.studentProfileId },
      select: { office: true },
    }),
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
        narrative: journals.find((j) => j.month === calendarMonth)?.narrative ?? "",
        weeklyReports: (byMonth.get(calendarMonth) ?? []).sort((a, b) =>
          a.weekStart.localeCompare(b.weekStart)
        ),
      };
    })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly reports"
        description="SLU's Journal on Learning Experience (JLE), one per month since you started reporting for duty. Submit it once every week in the month is approved or regarded, then upload the PDF to Google Classroom."
      />

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
            office={profile?.office ?? ""}
          />
        </CardContent>
      </Card>
    </div>
  );
}
