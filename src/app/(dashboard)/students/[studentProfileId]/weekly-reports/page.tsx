import { formatInstant } from "@/lib/documents/html";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { loadShift } from "@/lib/services/attendance/creditedHours";
import { defaultDayTimes, formatHrsMins } from "@/lib/utils/timeMath";
import { loadDayNotes } from "@/lib/services/attendance/reportedTimeRecords";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/predeployment/workPlanService";
import { formatSchedule, parseScheduleConfig, scheduleCells } from "@/lib/utils/schedule";
import { WeekTimetable } from "@/components/week-timetable";
import { reportPeriodEnd } from "@/lib/utils/reportWeek";
import { LongScheduleNotice } from "@/components/long-schedule-notice";
import { getHolidayCalendarForStudent } from "@/lib/services/attendance/attendanceService";
import {
  getConfirmedSubmission,
  getLatestSubmission,
  getWeeklyReportHistory,
  isSubmissionLate,
  isAwaitingReview,
  isWeeklyReportEditable,
} from "@/lib/services/reports/weeklyReportService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  addDays,
  getWeekStartMonday,
  getWeeklyReportDueDate,
  isWeeklyReportLate,
  toDateKey,
} from "@/lib/utils/reportDeadline";
import { weekNumberFrom } from "@/lib/documents/weeklyReportData";
import { sluFileName } from "@/lib/documents/slu";
import { displayNameFromEmail } from "@/lib/utils/displayName";
import {
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Hash,
  MessageSquareWarning,
} from "lucide-react";
import { WeeklyReportForm } from "./weekly-report-form";
import { jobsOnFor } from "@/lib/ai/jobs";
import type { AiHints as AiHintsData } from "@/lib/ai/processing";
import { GenerateWeekButton } from "./generate-week-button";
import { NotStartedWeek, WeekSection } from "./week-sections";
import { ReportPdfActions } from "./report-pdf-actions";
import { QuickApprove } from "./quick-approve";
import { WithdrawReport } from "./withdraw-report";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Weekly reports" };

// facultyAction is stored as "<ACTION> by <user id>"; the id means nothing to the intern.
const FACULTY_ACTION_TEXT: Record<string, string> = {
  APPROVED: "Approved by your faculty adviser.",
  REGARDED: "Accepted as submitted by your faculty adviser.",
  DISREGARDED: "Not counted toward your hours by your faculty adviser.",
  RETURNED: "Returned by your faculty adviser for revision.",
};
const describeFacultyAction = (action: string) =>
  FACULTY_ACTION_TEXT[action.split(" ")[0]] ?? "Reviewed by your faculty adviser.";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function WeeklyReportsPage(props: {
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

  // Independent reads, loaded together rather than one after another.
  const [reports, documents, conduct, shift, holidayList, aiJobs, profile, workPlan, notesByDate] =
    await Promise.all([
      prisma.weeklyReport.findMany({
        where: { studentProfileId: params.studentProfileId },
        orderBy: { weekStart: "desc" },
        include: { dailyEntries: { orderBy: { reportDate: "asc" } } },
      }),
      prisma.generatedDocument.findMany({
        where: { studentProfileId: params.studentProfileId, documentType: "WEEKLY_REPORT" },
        select: { periodLabel: true, status: true, referenceCode: true },
      }),
      // One query for all weeks; each week counts deductions dated on or before its end (as getConductDeductions does).
      prisma.conductRecord.findMany({
        where: { studentProfileId: params.studentProfileId, revokedAt: null },
        select: { date: true, hoursDeducted: true },
      }),
      loadShift(params.studentProfileId),
      getHolidayCalendarForStudent(params.studentProfileId),
      jobsOnFor(user),
      prisma.studentProfile.findUnique({
        where: { id: params.studentProfileId },
        select: {
          internshipStartDate: true,
          fullName: true,
          user: { select: { email: true } },
          renderedHours: true,
          requiredHours: true,
          semester: { select: { weekOneStart: true, archivedAt: true } },
        },
      }),
      getLatestApprovedWorkPlanForStudent(params.studentProfileId),
      // Reasons the intern gave on reported days (overtime, undertime, absences) and the
      // adviser's decision on each, by date.
      loadDayNotes(params.studentProfileId),
    ]);
  const schedule = parseScheduleConfig(workPlan?.scheduleConfig);
  const notesFor = (from: Date, to: Date) =>
    Object.fromEntries(
      Object.entries(notesByDate).filter(([k]) => k >= toDateKey(from) && k <= toDateKey(to))
    );
  const holidays = Object.fromEntries(
    holidayList
      .filter((h) => h.applicable)
      .map((h) => [toDateKey(h.date), { name: h.name, company: h.holidayType === "COMPANY" }])
  );
  // The intern's last worked day's times prefill new days when the schedule has none.
  const lastWorked = reports
    .flatMap((r) => r.dailyEntries)
    .filter((e) => e.attendanceStatus === "PRESENT" && e.timeIn && e.timeOut)
    .sort((a, b) => b.reportDate.getTime() - a.reportDate.getTime())[0];
  // With neither (an older schedule and no worked day yet), a standard day sized to the
  // scheduled hours, so the intern only writes what they did.
  const scheduledDay = reports
    .flatMap((r) => r.dailyEntries)
    .find((e) => Number(e.scheduledHours) > 0);
  const usualTimes = lastWorked
    ? {
        timeIn: lastWorked.timeIn ?? "",
        timeOut: lastWorked.timeOut ?? "",
        timeIn2: lastWorked.timeIn2 ?? "",
        timeOut2: lastWorked.timeOut2 ?? "",
      }
    : !shift && scheduledDay
      ? defaultDayTimes(Number(scheduledDay.scheduledHours))
      : null;
  // Week No. 1 is the intern's first report (reports are newest first), not the term's week 1.
  const firstReport = reports[reports.length - 1];
  // The signing steps show on the newest week whose submission stands.
  const newestSubmittedId = reports.find((r) => getConfirmedSubmission(r))?.id;
  // The name the PDF route files it under (weeklyReportData.ts: full name, else the school email).
  const pdfName =
    profile?.fullName?.trim() || displayNameFromEmail(profile?.user.email ?? "intern");
  const termWeekOne = profile?.semester.weekOneStart ?? null;
  const pdfByWeek = new Map(documents.map((d) => [d.periodLabel, d]));
  const deductionsAsOf = (weekEnd: Date) =>
    Math.round(
      conduct
        .filter((c) => c.date <= weekEnd)
        .reduce((sum, c) => sum + Number(c.hoursDeducted), 0) * 100
    ) / 100;
  const isOwner = user.role === "STUDENT_INTERN";
  const canReview = !isOwner;
  // The intern's weeks, as in Google Classroom (Jay and the faculty adviser, 12 Nov): To do (this
  // week, last week until its Tuesday, and returned weeks), Missing (past its Tuesday and not in),
  // Submitted (in review or done). Oldest first in To do and Missing, newest first in Submitted.
  const sectionOf = (r: (typeof reports)[number]): "todo" | "missing" | "submitted" =>
    !isWeeklyReportEditable(r)
      ? "submitted"
      : r.status === "RETURNED" || !isWeeklyReportLate(r.weekEnd)
        ? "todo"
        : "missing";
  const todo = reports.filter((r) => sectionOf(r) === "todo").reverse();
  const missing = reports.filter((r) => sectionOf(r) === "missing").reverse();
  const submitted = reports.filter((r) => sectionOf(r) === "submitted");
  // Weeks since the first report with no report yet: shown with a Start button, never created
  // on their own (opening the page writes nothing).
  const notStarted: { weekStart: Date; late: boolean }[] = [];
  // Finished the hours, or a past term: nothing more is owed (same rule as the reminders).
  const done =
    !profile ||
    profile.semester.archivedAt != null ||
    Number(profile.renderedHours) >= profile.requiredHours;
  if (isOwner && firstReport && !done) {
    const filed = new Set(reports.map((r) => toDateKey(r.weekStart)));
    const thisWeek = getWeekStartMonday(new Date());
    for (let w = getWeekStartMonday(firstReport.weekStart); w <= thisWeek; w = addDays(w, 7)) {
      if (!filed.has(toDateKey(w))) {
        notStarted.push({ weekStart: w, late: isWeeklyReportLate(addDays(w, 6)) });
      }
    }
  }
  const notStartedTodo = notStarted.filter((w) => !w.late);
  const notStartedMissing = notStarted.filter((w) => w.late);
  const todoCount = todo.length + notStartedTodo.length;
  const missingCount = missing.length + notStartedMissing.length;
  // One week opens: the oldest overdue one, else the first still to do.
  const firstEditableId = isOwner ? (missing[0] ?? todo[0])?.id : undefined;
  // R5: interns see their own plan-coverage pointers (the newest week that has them).
  const coverage = aiJobs.has("coverage")
    ? reports.map((r) => (r.aiHints as AiHintsData | null)?.coverage).find((c) => c?.missing.length)
    : undefined;

  function renderWeek(report: (typeof reports)[number]) {
    const index = reports.indexOf(report);
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
    // Reports are sorted newest first, so the previous week is the next one. Only an
    // editable week runs the copy check, so only it is sent the text (item 40: payload).
    const priorAccomplishments = editable
      ? (reports[index + 1]?.dailyEntries ?? []).map((e) => e.accomplishments ?? "").filter(Boolean)
      : [];

    // Only a week the intern can still edit (or the newest, for staff) starts open; the
    // rest fold to one line so the page isn't every week's every day at once.
    const startOpen = isOwner ? report.id === firstEditableId : index === 0;
    const weekHours = formatHrsMins(Number(report.totalHours));
    const weekNo = weekNumberFrom(firstReport.weekStart, report.weekStart);
    // The class may be in a later week than the intern's own count: say which
    // Google Classroom week this report goes under.
    const termWeek = termWeekOne
      ? Math.round(
          (report.weekStart.getTime() - getWeekStartMonday(termWeekOne).getTime()) /
            (7 * 24 * 60 * 60 * 1000)
        ) + 1
      : null;
    return (
      <div
        key={report.id}
        id={`week-${toDateKey(report.weekStart)}`}
        className="scroll-mt-6 rounded-lg border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Week No. {weekNo}
              <span className="font-normal text-muted-foreground">
                {" "}
                · {formatDate(report.weekStart)} –{" "}
                {formatDate(reportPeriodEnd(report.weekStart, report.dailyEntries))}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              WWR{String(weekNo).padStart(2, "0")} · due{" "}
              {formatDate(getWeeklyReportDueDate(report.weekEnd))}
              {termWeek != null && termWeek > 0 && termWeek !== weekNo && (
                <> · goes under Week {termWeek} in Google Classroom</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {awaitingReview ? (
              <Badge variant="secondary">Submitted · awaiting review</Badge>
            ) : report.status === "PENDING" ? (
              isWeeklyReportLate(report.weekEnd) ? (
                // Past its Tuesday: say so before Submit asks for the reason.
                <Badge variant="destructive">Overdue · not submitted</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )
            ) : (
              <StatusBadge status={report.status} />
            )}
            {submission?.late && <Badge variant="destructive">Late</Badge>}
            {confirmed && (
              <ReportPdfActions
                endpoint={`/api/weekly-reports/${report.id}/pdf`}
                status={pdfStatus}
                canGenerate
              />
            )}
            {isOwner && awaitingReview && !isWeeklyReportLate(report.weekEnd) && (
              <WithdrawReport weeklyReportId={report.id} />
            )}
            {canReview && awaitingReview && <QuickApprove weeklyReportId={report.id} />}
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

        {isOwner && report.id === newestSubmittedId && (
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            {[
              "Download the PDF",
              "Have your HTE supervisor sign it",
              `Upload it to Google Classroom as ${sluFileName({ kind: "WWR", week: weekNo }, pdfName)}`,
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}

        {submission && (awaitingReview || report.status !== "PENDING") && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Hash className="size-3.5" aria-hidden="true" />
            <span className="font-mono text-foreground">{submission.referenceCode}</span>· submitted{" "}
            {formatInstant(new Date(submission.timestamp))}
            {submission.reasonForDelay && <> · delay reason: {submission.reasonForDelay}</>}
          </p>
        )}

        {(feedback.length > 0 || report.facultyAction) && (
          // Amber only when the report came back for changes; otherwise neutral.
          <div
            className={cn(
              "mt-3 space-y-1 rounded-md border p-3 text-sm",
              report.status === "RETURNED" ? "border-notice-border bg-notice" : "bg-muted/50"
            )}
          >
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
              <p className="text-muted-foreground">{describeFacultyAction(report.facultyAction)}</p>
            )}
          </div>
        )}

        <details open={startOpen} className="group/week mt-3">
          <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 text-sm text-primary [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="size-4 transition-transform duration-200 group-open/week:rotate-180"
              aria-hidden="true"
            />
            <span className="group-open/week:hidden">
              {editable ? "Continue this report" : "Show the days"}
            </span>
            <span className="hidden group-open/week:inline">Hide the days</span>
            <span className="text-muted-foreground tabular-nums">· {weekHours}</span>
          </summary>
          <div className="mt-3">
            <WeeklyReportForm
              weeklyReportId={report.id}
              editable={editable}
              shift={shift}
              usualTimes={usualTimes}
              firstWeek={report.id === firstReport.id}
              firstDay={profile?.internshipStartDate?.toISOString() ?? null}
              // A resubmission after a return keeps the first submission's lateness.
              late={isSubmissionLate(report)}
              holidays={holidays}
              notes={notesFor(report.weekStart, report.weekEnd)}
              reviewable={canReview}
              weekEnd={report.weekEnd.toISOString()}
              priorAccomplishments={priorAccomplishments}
              clarityAi={editable && aiJobs.has("clarity")}
              totals={{
                totalHours: Number(report.totalHours),
                runningTotal: Number(report.runningTotal),
                conductDeductions: deductionsAsOf(report.weekEnd),
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
                timeIn2: e.timeIn2,
                timeOut2: e.timeOut2,
              }))}
            />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly reports"
        description="Daily accomplishments for each week. Due every Tuesday."
      />
      {isOwner && reports.length === 0 && (
        <details className="rounded-lg border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">How signing works</summary>
          <p className="mt-2 text-muted-foreground">
            After submitting, download the PDF and have your supervisor sign it. A week with
            overtime, under time or an absence has that report on the next page of the same PDF.
            Upload the signed copy to{" "}
            <span className="font-medium text-foreground">Google Classroom</span> under the file
            name IDSMS gives it (for example WWR01 LastnameFirstname.pdf). WWR01 is the week you
            started your OJT, even when the class is already in a later week. Signed documents are
            never uploaded to IDSMS.
          </p>
        </details>
      )}

      {schedule && !isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" aria-hidden="true" />
                  {isOwner ? "Your work week" : "Work week"}
                </CardTitle>
                <CardDescription>
                  {formatSchedule(schedule)}. Each weekly report lists these days.
                </CardDescription>
              </div>
              <Link
                href={`/students/${params.studentProfileId}/attendance#schedule`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
              >
                {isOwner ? "Request a schedule change" : "Schedule details"}
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <WeekTimetable
              cells={scheduleCells(schedule)}
              label={isOwner ? "Your work week" : "Work week"}
              legend={["work", "off"]}
            />
            <div className="mt-3">
              <LongScheduleNotice schedule={schedule} forIntern={isOwner} />
            </div>
          </CardContent>
        </Card>
      )}

      {isOwner && reports.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Start your first weekly report</CardTitle>
            <CardDescription>
              Pick a day in the week you started your OJT: that week is your WWR01. The report lists
              your work days with your usual times already filled in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GenerateWeekButton studentProfileId={params.studentProfileId} />
          </CardContent>
        </Card>
      )}

      {!isOwner && (
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
              reports.map((report) => renderWeek(report))
            )}
          </CardContent>
        </Card>
      )}

      {isOwner && reports.length > 0 && (
        <div className="space-y-3">
          <WeekSection
            title="To do"
            count={todoCount}
            hint={
              todo.some((r) => r.status === "RETURNED")
                ? `${todo.filter((r) => r.status === "RETURNED").length} returned by your adviser`
                : todoCount > 0
                  ? "due Tuesday"
                  : "nothing to write right now"
            }
            open={todoCount > 0}
          >
            {notStartedTodo.map((w) => (
              <NotStartedWeek
                key={toDateKey(w.weekStart)}
                studentProfileId={params.studentProfileId}
                weekStart={w.weekStart}
                weekNo={weekNumberFrom(firstReport.weekStart, w.weekStart)}
                late={false}
              />
            ))}
            {todo.map((r) => renderWeek(r))}
          </WeekSection>
          <WeekSection
            title="Missing"
            count={missingCount}
            hint={missingCount > 0 ? "past the Tuesday deadline: still to submit" : "none"}
            tone="alert"
            open={missingCount > 0}
          >
            {notStartedMissing.map((w) => (
              <NotStartedWeek
                key={toDateKey(w.weekStart)}
                studentProfileId={params.studentProfileId}
                weekStart={w.weekStart}
                weekNo={weekNumberFrom(firstReport.weekStart, w.weekStart)}
                late
              />
            ))}
            {missing.map((r) => renderWeek(r))}
          </WeekSection>
          <WeekSection
            title="Submitted"
            count={submitted.length}
            hint={(() => {
              const waiting = submitted.filter((r) => isAwaitingReview(r)).length;
              const done = submitted.length - waiting;
              return (
                [waiting && `${waiting} awaiting review`, done && `${done} approved or accepted`]
                  .filter(Boolean)
                  .join(" · ") || "none yet"
              );
            })()}
            open={false}
          >
            {submitted.map((r) => renderWeek(r))}
          </WeekSection>
        </div>
      )}

      {isOwner && coverage && (
        <Card>
          <CardHeader>
            <CardTitle>Planned tasks not found in your entries</CardTitle>
            <CardDescription>
              AI assist compared your approved work plan with your last {coverage.weeks} weeks of
              entries. &ldquo;Not found&rdquo; is not &ldquo;not done&rdquo;: if you did these,
              describe them in your entries; if the company hasn&apos;t given you the work, raise it
              with them. Disagree? Ask for a correction under Account settings › Your data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground/85">
              {coverage.missing.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {isOwner && reports.length > 0 && (
        <details className="rounded-lg border bg-card px-4 py-3 text-sm">
          <summary className="flex min-h-6 cursor-pointer items-center font-medium">
            Start a report for another week
          </summary>
          <p className="mt-2 mb-3 text-muted-foreground">
            Weeks since your first report are listed above. Use this only if your OJT started before
            your first report: that week becomes your Week No. 1 (WWR01) and the weeks after it are
            numbered again, so rename any PDF you already uploaded.
          </p>
          <GenerateWeekButton studentProfileId={params.studentProfileId} />
        </details>
      )}
    </div>
  );
}
