import Link from "next/link";
import { Role } from "@prisma/client";
import { ArrowRight } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import {
  computeProjectedCompletionDate,
  getFinalReportThreshold,
  getHoursSummary,
} from "@/lib/services/attendanceService";
import { getFinalCoverDocument } from "@/lib/services/documentService";
import { getAttentionItems } from "@/lib/services/attentionService";
import { ReportPdfActions } from "./students/[studentProfileId]/weekly-reports/report-pdf-actions";
import { prisma } from "@/lib/prisma";
import { getUserProfile } from "@/lib/services/userService";
import { getChecklistProgress } from "@/lib/services/checklistService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { greeting } from "@/lib/utils/greeting";
import { FacultyDashboard } from "./faculty-dashboard";
import { CoordinatorDashboard } from "./coordinator-dashboard";
import { StudentDashboardTables } from "./student-dashboard";
import { reportState, weeklyHistory } from "@/lib/services/complianceService";
import { buildInternshipTrack, daysUntil } from "@/lib/utils/internshipTrack";
import { getWeeklyReportDueDate } from "@/lib/utils/reportDeadline";
import { InternshipTrack, MiniTrack } from "@/components/internship-track";
import { BeaconRing } from "@/components/beacon-ring";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });

export default async function DashboardHomePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUserPage();

  if (STAFF_ROLES.includes(user.role)) {
    return (
      <div className="space-y-6">
        <PageHeader
          hero
          greeting={greeting()}
          title="Department overview"
          description="Every intern this semester: hours, requirements and weekly reports."
        />
        <CoordinatorDashboard role={user.role} searchParams={searchParams} />
      </div>
    );
  }
  if (user.role === Role.FACULTY_ADVISER) {
    return (
      <div className="space-y-6">
        <PageHeader
          hero
          greeting={greeting()}
          title="Advising overview"
          description="Your class groups: what is waiting for your review, then each intern."
        />
        <FacultyDashboard facultyId={user.id} />
      </div>
    );
  }

  const profile = await getUserProfile(user.id);
  const studentProfile = profile?.studentProfile;
  const [progress, hours, projectedCompletion] = studentProfile
    ? await Promise.all([
        getChecklistProgress(studentProfile.id),
        getHoursSummary(studentProfile.id),
        computeProjectedCompletionDate(studentProfile.id),
      ])
    : [null, null, null];
  const confirmedHours = hours?.confirmedHours ?? 0;
  const requiredHours = hours?.requiredHours ?? 0;
  const pendingHours = hours?.pendingHours ?? 0;
  const [finalThreshold, finalCover] = studentProfile
    ? await Promise.all([
        getFinalReportThreshold(studentProfile.program, studentProfile.requiredHours),
        getFinalCoverDocument(studentProfile.id),
      ])
    : [null, null];
  const coverUnlocked = finalThreshold !== null && confirmedHours >= finalThreshold;
  const attention = studentProfile ? await getAttentionItems(studentProfile.id) : null;
  const reports = studentProfile
    ? await prisma.weeklyReport.findMany({
        where: { studentProfileId: studentProfile.id },
        select: { id: true, weekStart: true, weekEnd: true, status: true, revisionHistory: true },
        orderBy: { weekStart: "desc" },
      })
    : [];
  const reportHistory = weeklyHistory(reports);
  const track = buildInternshipTrack({
    reports: reports.map((r) => ({ weekStart: r.weekStart, state: reportState(r) })),
    projectedFinish: projectedCompletion,
  });
  // The next report to file: this week's, unless it is already in.
  const thisWeek = track.find((w) => w.isCurrent);
  const nextDue =
    thisWeek && thisWeek.kind === "open"
      ? getWeeklyReportDueDate(new Date(thisWeek.weekStart.getTime() + 6 * 24 * 60 * 60 * 1000))
      : null;
  const attentionRows = attention
    ? [
        {
          count: attention.returnedReports,
          label: "Weekly reports returned for revision",
          href: "/weekly-reports",
        },
        {
          count: attention.reportsDueSoon,
          label: "Weekly reports due within 48 hours",
          href: "/weekly-reports",
        },
        {
          count: attention.pendingDeviations,
          label: "Leave & time requests awaiting review",
          href: "/leave-requests",
        },
        {
          count: attention.incompleteChecklistItems,
          label: "Checklist items not yet approved",
          href: "/checklist",
        },
      ].filter((row) => row.count > 0)
    : [];

  const percent = requiredHours > 0 ? Math.min(100, (confirmedHours / requiredHours) * 100) : 0;
  const finding = !studentProfile
    ? "Your student profile is not set up yet. Ask your coordinator."
    : `${confirmedHours} of ${requiredHours} hours confirmed · ` +
      (projectedCompletion
        ? `on schedule to finish ${fmtDate(projectedCompletion)}`
        : "set your work schedule to see your finish date");

  // Submission streak: weeks in a row, most recent first, whose report went in (lateness not counted; this week excluded).
  const past = track.filter((w) => !w.isCurrent && w.kind !== "ahead").reverse();
  const streakEnd = past.findIndex((w) => !["confirmed", "review", "returned"].includes(w.kind));
  const streak = streakEnd === -1 ? past.length : streakEnd;
  const daysLeft = nextDue ? daysUntil(nextDue) : null;
  const recentKinds = track
    .filter((w) => w.kind !== "ahead")
    .slice(-8)
    .map((w) => w.kind);
  const fmtDue = (d: Date) =>
    d.toLocaleDateString("en-PH", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="space-y-5">
      <PageHeader
        hero
        greeting={greeting(studentProfile?.fullName)}
        title="My internship"
        description={finding}
        actions={
          <Button asChild variant="secondary" size="lg" className="shadow-sm">
            <Link href="/weekly-reports">This week&apos;s report</Link>
          </Button>
        }
      />

      {/* Bento: the biggest tile answers "am I on track?"; colour blocks carry one figure each. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        <section
          aria-labelledby="hours-title"
          className="relative flex flex-col gap-5 overflow-hidden rounded-3xl p-6 beacon-band md:col-span-6 xl:col-span-4 xl:row-span-2"
        >
          <h2 id="hours-title" className="text-sm font-medium text-white/80">
            Confirmed hours
          </h2>
          <div className="flex items-center gap-5">
            <BeaconRing value={confirmedHours} max={requiredHours} />
            <div>
              <p className="text-[40px] leading-none font-bold tracking-tight text-white tabular-nums">
                {confirmedHours}
              </p>
              <p className="mt-1 text-sm text-white/80">of {requiredHours} hrs</p>
              <p className="mt-3 inline-flex rounded-full bg-white/15 px-2.5 py-1 text-sm font-semibold text-white tabular-nums">
                {Math.round(percent)}% there
              </p>
            </div>
          </div>
          <dl className="mt-auto grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-white/10 px-3 py-2.5">
              <dt className="text-white/70">Pending review</dt>
              <dd className="mt-0.5 font-semibold text-white tabular-nums">
                {pendingHours > 0 ? `+${pendingHours} hrs` : "—"}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2.5">
              <dt className="text-white/70">Projected finish</dt>
              <dd className="mt-0.5 font-semibold text-white">
                {projectedCompletion ? fmtDate(projectedCompletion) : "—"}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2.5">
              <dt className="text-white/70">Host company</dt>
              <dd className="mt-0.5 font-semibold text-white">
                {studentProfile?.companyId ? "Assigned" : "Not yet"}
              </dd>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2.5">
              <dt className="text-white/70">Program</dt>
              <dd className="mt-0.5 font-semibold text-white">{studentProfile?.program ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <Card className="md:col-span-6 xl:col-span-8">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold text-brand-900">Your weeks</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Every week of your internship, coloured by where its report stands.
            </p>
            {studentProfile ? (
              <InternshipTrack
                weeks={track}
                finishLabel={projectedCompletion ? fmtDate(projectedCompletion) : null}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Your profile isn&apos;t set up yet.</p>
            )}
          </CardContent>
        </Card>

        <Link
          href="/weekly-reports"
          className="group flex flex-col justify-between rounded-3xl border border-sky-200/80 bg-sky-100 p-5 text-sky-950 transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0 md:col-span-3 xl:col-span-3"
        >
          <span className="text-sm font-medium">Next deadline</span>
          <span>
            <span className="block text-2xl font-bold tracking-tight">
              {nextDue ? fmtDue(nextDue) : "All caught up"}
            </span>
            <span className="mt-1 block text-sm text-sky-900/80">
              {nextDue ? "This week's report" : "This week's report is in"}
            </span>
          </span>
          {daysLeft !== null && (
            <span className="block">
              <span className="flex justify-between text-xs font-medium text-sky-900/80">
                <span>
                  {daysLeft === 0
                    ? "Due today"
                    : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
                </span>
                <span>Tue deadline</span>
              </span>
              <span
                className="mt-1.5 block h-2 overflow-hidden rounded-full bg-sky-200/80"
                aria-hidden="true"
              >
                <span
                  className="block h-full rounded-full bg-sky-700"
                  style={{ width: `${Math.round(((7 - Math.min(daysLeft, 7)) / 7) * 100)}%` }}
                />
              </span>
            </span>
          )}
        </Link>

        <div className="flex flex-col justify-between rounded-3xl border border-mint-200 bg-mint-100 p-5 text-mint-900 md:col-span-3 xl:col-span-2">
          <span className="text-sm font-medium">Submission streak</span>
          <span>
            <span className="block text-4xl font-bold tracking-tight tabular-nums">{streak}</span>
            <span className="mt-1 block text-sm text-mint-900/80">
              {streak === 1 ? "week in a row" : "weeks in a row"}
            </span>
          </span>
          {recentKinds.length > 0 && (
            <span className="block">
              <span className="mb-1.5 block text-xs font-medium text-mint-900/80">
                Last {recentKinds.length} weeks
              </span>
              <MiniTrack kinds={recentKinds} />
            </span>
          )}
        </div>

        <Card className="flex flex-col md:col-span-6 xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-brand-900">Waiting on you</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {attentionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is waiting on you right now.</p>
            ) : (
              <ul className="-mx-2">
                {attentionRows.map((row) => (
                  <li key={row.label}>
                    <Link
                      href={row.href}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 tabular-nums">
                        {row.count}
                      </span>
                      <span className="flex-1">{row.label}</span>
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <StudentDashboardTables
          requirements={progress?.items ?? []}
          history={reportHistory}
          aside={
            studentProfile && finalThreshold !== null ? (
              <Card>
                <CardContent className="p-5">
                  <p className="text-sm font-semibold text-brand-900">Final report cover</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {coverUnlocked
                      ? "Unlocked: generate the cover page for your final report."
                      : `Unlocks at ${finalThreshold} confirmed hours.`}
                  </p>
                  {coverUnlocked && (
                    <div className="mt-3">
                      <ReportPdfActions
                        endpoint={`/api/students/${studentProfile.id}/final-cover`}
                        status={finalCover?.status ?? null}
                        canGenerate={coverUnlocked}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null
          }
        />
      </div>
    </div>
  );
}
