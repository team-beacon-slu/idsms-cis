import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import {
  getConfirmedSubmission,
  getCurrentSignedCopy,
  getLatestSubmission,
  getWeeklyReportHistory,
  isAwaitingReview,
  isWeeklyReportEditable,
} from "@/lib/services/weeklyReportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { getWeeklyReportDueDate, toDateKey } from "@/lib/utils/reportDeadline";
import { ClipboardCheck, FileBarChart2, FileText, Hash, MessageSquareWarning } from "lucide-react";
import { WeeklyReportForm } from "./weekly-report-form";
import { GenerateWeekButton } from "./generate-week-button";
import { ReportPdfActions } from "./report-pdf-actions";
import { SignedCopyUpload } from "./signed-copy-upload";

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

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

  const reports = await prisma.weeklyReport.findMany({
    where: { studentProfileId: params.studentProfileId },
    orderBy: { weekStart: "desc" },
    include: { dailyEntries: { orderBy: { reportDate: "asc" } } },
  });
  const documents = await prisma.generatedDocument.findMany({
    where: { studentProfileId: params.studentProfileId, documentType: "WEEKLY_REPORT" },
    select: { periodLabel: true, status: true, referenceCode: true },
  });
  const pdfByWeek = new Map(documents.map((d) => [d.periodLabel, d]));
  const isOwner = user.role === "STUDENT_INTERN";
  const canReview = !isOwner;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <FileText className="size-5 text-primary" aria-hidden="true" />
            Weekly Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Daily accomplishments for each week of the internship. Reports are due the Tuesday after
            each week ends.
          </p>
        </div>
        <Link
          href={`/students/${params.studentProfileId}/monthly-reports`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "cursor-pointer gap-1.5"
          )}
        >
          <FileBarChart2 className="size-4" aria-hidden="true" />
          Monthly reports
        </Link>
      </div>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Start a weekly report</CardTitle>
            <CardDescription>
              Pick any day in the week. A form is created with one row per scheduled working day,
              skipping holidays.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenerateWeekButton studentProfileId={params.studentProfileId} />
          </CardContent>
        </Card>
      )}

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
              description={
                isOwner
                  ? "Start your first report above once your work schedule is set."
                  : "Submitted reports will appear here, most recent first."
              }
            />
          ) : (
            reports.map((report, index) => {
              const submission = getLatestSubmission(report.revisionHistory);
              // PDFs exist only for the submission the student stands behind;
              // one carrying an older reference code (pre-Return) is stale.
              const confirmed = getConfirmedSubmission(report);
              const pdf = pdfByWeek.get(toDateKey(report.weekStart));
              const pdfStatus =
                confirmed && pdf?.referenceCode === confirmed.referenceCode ? pdf.status : null;
              const awaitingReview = isAwaitingReview(report);
              const editable = isOwner && isWeeklyReportEditable(report);
              const feedback = getWeeklyReportHistory(report.revisionHistory).filter(
                (entry) => entry.type !== "SUBMITTED" && typeof entry.notes === "string"
              );
              // Reports are sorted newest first, so the previous week is the next one.
              const priorAccomplishments = (reports[index + 1]?.dailyEntries ?? [])
                .map((e) => e.accomplishments ?? "")
                .filter(Boolean);

              return (
                <div
                  key={report.id}
                  className="rounded-lg border p-4 transition-colors duration-200 hover:bg-muted/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {formatDate(report.weekStart)} – {formatDate(report.weekEnd)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(getWeeklyReportDueDate(report.weekEnd))}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {awaitingReview ? (
                        <Badge variant="secondary">Submitted · awaiting review</Badge>
                      ) : report.status === "PENDING" && !submission ? (
                        <Badge variant="outline">Draft</Badge>
                      ) : (
                        <StatusBadge status={report.status} />
                      )}
                      {submission?.late && <Badge variant="destructive">Late</Badge>}
                      {confirmed && (
                        <>
                          <ReportPdfActions
                            endpoint={`/api/weekly-reports/${report.id}/pdf`}
                            status={pdfStatus}
                            canGenerate
                          />
                          <SignedCopyUpload
                            weeklyReportId={report.id}
                            hasSignedCopy={getCurrentSignedCopy(report) !== null}
                            canUpload={isOwner && report.status !== "DISREGARDED"}
                          />
                        </>
                      )}
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

                  {submission && (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Hash className="size-3.5" aria-hidden="true" />
                      <span className="font-mono text-foreground">{submission.referenceCode}</span>·
                      submitted {new Date(submission.timestamp).toLocaleString()}
                      {submission.reasonForDelay && (
                        <> · delay reason: {submission.reasonForDelay}</>
                      )}
                    </p>
                  )}

                  {(feedback.length > 0 || report.facultyAction) && (
                    <div className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/20 dark:bg-amber-500/10">
                      <p className="flex items-center gap-1.5 font-medium text-foreground">
                        <MessageSquareWarning className="size-4" aria-hidden="true" />
                        Faculty feedback
                      </p>
                      {feedback.map((entry, i) => (
                        <p key={i} className="text-muted-foreground">
                          {String(entry.notes)}
                        </p>
                      ))}
                      {feedback.length === 0 && report.facultyAction && (
                        <p className="text-muted-foreground">{report.facultyAction}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-3">
                    <WeeklyReportForm
                      weeklyReportId={report.id}
                      editable={editable}
                      weekEnd={report.weekEnd.toISOString()}
                      priorAccomplishments={priorAccomplishments}
                      totals={{
                        totalHours: Number(report.totalHours),
                        runningTotal: Number(report.runningTotal),
                        remainingHours: Number(report.remainingHours),
                      }}
                      entries={report.dailyEntries.map((e) => ({
                        id: e.id,
                        reportDate: e.reportDate.toISOString(),
                        scheduledHours: Number(e.scheduledHours),
                        actualHours: e.actualHours == null ? null : Number(e.actualHours),
                        accomplishments: e.accomplishments,
                        toolsUsed: e.toolsUsed,
                        attendanceStatus: e.attendanceStatus,
                        timeIn: e.timeIn,
                        timeOut: e.timeOut,
                      }))}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
