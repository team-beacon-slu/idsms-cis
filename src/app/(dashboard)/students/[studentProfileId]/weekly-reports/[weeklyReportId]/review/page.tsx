import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { getWeeklyReport } from "@/lib/services/weeklyReportService";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ClipboardList, Copy, Sparkles } from "lucide-react";
import { WeeklyReportReviewActions } from "./review-actions";

const SENTIMENT_LABEL: Record<string, string> = {
  POSITIVE: "Positive",
  NEUTRAL: "Neutral",
  NEGATIVE: "Negative",
};

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

  const hasAiSignal = report!.similarityFlag || report!.sentimentLabel !== null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-5 text-primary" aria-hidden="true" />
              <CardTitle>Review Weekly Report</CardTitle>
            </div>
            <StatusBadge status={report!.status} />
          </div>
          <CardDescription>
            Week of {new Date(report!.weekStart).toLocaleDateString()} –{" "}
            {new Date(report!.weekEnd).toLocaleDateString()}
          </CardDescription>
        </CardHeader>

        {hasAiSignal && (
          <CardContent className="space-y-3 pt-0">
            {report!.similarityFlag && (
              <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-500/20 dark:bg-blue-500/10">
                <Copy
                  className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="font-medium text-blue-900 dark:text-blue-300">
                    Similarity advisory
                  </p>
                  <p className="text-blue-800/90 dark:text-blue-300/80">
                    This entry resembles other submitted content
                    {report!.similarityScore !== null
                      ? ` (similarity score ${Number(report!.similarityScore).toFixed(2)})`
                      : ""}
                    . This is a signal for your review, not a determination — use your judgment.
                  </p>
                </div>
              </div>
            )}
            {report!.sentimentLabel && (
              <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-500/20 dark:bg-slate-500/10">
                <Sparkles
                  className="mt-0.5 size-4 shrink-0 text-slate-600 dark:text-slate-300"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-900 dark:text-slate-200">
                    Sentiment advisory —{" "}
                    {SENTIMENT_LABEL[report!.sentimentLabel] ?? report!.sentimentLabel}
                  </p>
                  <p className="text-slate-700/90 dark:text-slate-300/80">
                    {report!.sentimentConfidence !== null
                      ? `Confidence ${(Number(report!.sentimentConfidence) * 100).toFixed(0)}%. `
                      : ""}
                    AI-assisted, advisory only — it never decides the outcome of this review.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        )}

        <CardContent className={hasAiSignal ? "pt-0" : undefined}>
          <WeeklyReportReviewActions weeklyReportId={params.weeklyReportId} />
        </CardContent>
      </Card>
    </div>
  );
}
