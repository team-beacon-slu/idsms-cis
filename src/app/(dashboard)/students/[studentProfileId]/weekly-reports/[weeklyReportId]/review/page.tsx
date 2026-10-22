import { notFound, redirect } from "next/navigation";
import { formatCalendarDate } from "@/lib/documents/html";
import { requireUserPage } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getConductDeductions,
  getWeeklyReport,
  isAwaitingReview,
} from "@/lib/services/weeklyReportService";
import { WeeklyReportForm } from "../../weekly-report-form";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ClipboardList, Copy, Sparkles } from "lucide-react";
import { WeeklyReportReviewActions } from "./review-actions";
import { getAdvisoryView } from "@/lib/ai/display";
import { getAiSettings } from "@/lib/ai/settings";

const SENTIMENT_LABEL: Record<string, string> = {
  POSITIVE: "Positive",
  NEUTRAL: "Neutral",
  NEGATIVE: "Negative",
};

// Ownership note (pre-flight fix): a role check alone isn't enough — a
// Faculty Adviser must also be assigned to this specific student (same
// FacultyClassGroup rule every other review surface in this plan enforces).
export default async function WeeklyReportReviewPage(props: {
  params: Promise<{ studentProfileId: string; weeklyReportId: string }>;
}) {
  const params = await props.params;
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
  // The URL's student was access-checked above, so the report must be theirs (same rule as preview).
  if (report!.studentProfileId !== params.studentProfileId) {
    notFound();
  }
  const student = await prisma.studentProfile.findUnique({
    where: { id: params.studentProfileId },
    select: { fullName: true, studentNumber: true },
  });
  const awaitingReview = isAwaitingReview(report!);

  // FR-AI-05/07: cached columns only, with NFR-AI-04's confidence floor.
  const view = getAdvisoryView(report!, await getAiSettings());
  const hasAiSignal = Boolean(view.similarity || view.sentiment || view.pending);

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
            {student?.fullName ?? student?.studentNumber ?? "Student"} · Week of{" "}
            {formatCalendarDate(new Date(report!.weekStart))} –{" "}
            {formatCalendarDate(new Date(report!.weekEnd))}
          </CardDescription>
          <p className="text-xs text-muted-foreground">
            Supervisor-signed copies are submitted on Google Classroom, not in IDSMS.
          </p>
        </CardHeader>

        {hasAiSignal && (
          <CardContent className="space-y-3 pt-0">
            {view.pending && (
              <p className="text-sm text-muted-foreground">
                AI advisory pending — processed within 24 hours.
              </p>
            )}
            {view.similarity && (
              <div className="flex gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
                <Copy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">Similarity advisory</p>
                  <p className="text-muted-foreground">
                    This week resembles the student&apos;s earlier reports (similarity score{" "}
                    {view.similarity.score.toFixed(2)}). This is a signal for your review, not a
                    determination — use your judgment.
                  </p>
                </div>
              </div>
            )}
            {view.sentiment && (
              <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-500/20 dark:bg-slate-500/10">
                <Sparkles
                  className="mt-0.5 size-4 shrink-0 text-slate-600 dark:text-slate-300"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-900 dark:text-slate-200">
                    Sentiment advisory —{" "}
                    {SENTIMENT_LABEL[view.sentiment.label] ?? view.sentiment.label}
                  </p>
                  {view.sentiment.reasoning && (
                    <p className="text-slate-700/90 dark:text-slate-300/80">
                      {view.sentiment.reasoning}
                    </p>
                  )}
                  <p className="text-slate-700/90 dark:text-slate-300/80">
                    Confidence {(view.sentiment.confidence * 100).toFixed(0)}%. AI-assisted,
                    advisory only — it never decides the outcome of this review.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        )}

        {/* The report itself, so the adviser decides with the entries in front of them. */}
        <CardContent className="pt-0">
          <WeeklyReportForm
            weeklyReportId={report!.id}
            editable={false}
            weekEnd={report!.weekEnd.toISOString()}
            priorAccomplishments={[]}
            totals={{
              totalHours: Number(report!.totalHours),
              runningTotal: Number(report!.runningTotal),
              conductDeductions: await getConductDeductions(
                report!.studentProfileId,
                report!.weekEnd
              ),
              remainingHours: Number(report!.remainingHours),
            }}
            entries={[...report!.dailyEntries]
              .sort((a, b) => a.reportDate.getTime() - b.reportDate.getTime())
              .map((e) => ({
                id: e.id,
                reportDate: e.reportDate.toISOString(),
                scheduledHours: Number(e.scheduledHours),
                actualHours: e.actualHours == null ? null : Number(e.actualHours),
                accomplishments: e.accomplishments,
                toolsUsed: e.toolsUsed,
                attendanceStatus: e.attendanceStatus,
                timeIn: e.timeIn,
                timeOut: e.timeOut,
                timeIn2: e.timeIn2,
                timeOut2: e.timeOut2,
              }))}
          />
        </CardContent>

        <CardContent className="pt-0">
          {awaitingReview ? (
            <WeeklyReportReviewActions weeklyReportId={params.weeklyReportId} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to review: this report isn&apos;t waiting for a decision.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
