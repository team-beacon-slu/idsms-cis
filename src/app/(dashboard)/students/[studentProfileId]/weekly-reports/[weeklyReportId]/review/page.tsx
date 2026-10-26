import { notFound, redirect } from "next/navigation";
import { formatCalendarDate } from "@/lib/documents/html";
import { requireUserPage } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getConductDeductions,
  getWeeklyReport,
  isAwaitingReview,
} from "@/lib/services/reports/weeklyReportService";
import { WeeklyReportForm } from "../../weekly-report-form";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ClipboardList } from "lucide-react";
import { WeeklyReportReviewActions } from "./review-actions";
import { getAdvisoryView } from "@/lib/ai/display";
import { getAiSettings } from "@/lib/ai/settings";
import { jobsOnFor } from "@/lib/ai/jobs";
import { AiHints } from "@/components/ai/ai-hints";

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

  // FR-AI-05/07: cached hints only, shown while their job is on and the adviser's AI
  // assist switch is on.
  const [on, { similarityThreshold }] = await Promise.all([jobsOnFor(user), getAiSettings()]);
  const view = getAdvisoryView(report!, { on, similarityThreshold });
  const texts: Record<string, string> = Object.fromEntries(
    report!.dailyEntries.map((e) => [e.id, e.accomplishments ?? ""])
  );
  if (view.similar) {
    // The earlier day belongs to this same intern (the nightly job only compares within one intern).
    const prev = await prisma.dailyReportEntry.findFirst({
      where: {
        id: view.similar.prevEntryId,
        weeklyReport: { studentProfileId: params.studentProfileId },
      },
      select: { accomplishments: true },
    });
    texts[view.similar.prevEntryId] = prev?.accomplishments ?? "";
  }

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

        <CardContent className="pt-0 empty:hidden">
          <AiHints view={view} reportId={report!.id} texts={texts} />
        </CardContent>

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
