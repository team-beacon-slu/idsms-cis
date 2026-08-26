import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listWeeklyReportsForStudent } from "@/lib/services/weeklyReportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { ClipboardCheck, FileText } from "lucide-react";
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
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <FileText className="size-5 text-primary" aria-hidden="true" />
          Weekly Reports
        </h1>
        <p className="text-sm text-muted-foreground">
          Daily accomplishments submitted for each week of the internship.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All reports ({reports.length})</CardTitle>
          <CardDescription>Ordered from the most recent week.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reports.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="No weekly reports yet"
              description="Submitted reports will appear here, most recent first."
            />
          ) : (
            reports.map((report) => (
              <div
                key={report.id}
                className="rounded-lg border p-4 transition-colors duration-200 hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(report.weekStart).toLocaleDateString()} –{" "}
                      {new Date(report.weekEnd).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Number(report.totalHours)} hrs this week · {Number(report.remainingHours)}{" "}
                      hrs remaining
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={report.status} />
                    {canReview && (
                      <Link
                        href={`/students/${params.studentProfileId}/weekly-reports/${report.id}/review`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "cursor-pointer transition-colors duration-200"
                        )}
                      >
                        Review
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <WeeklyReportForm weeklyReportId={report.id} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
