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
import { FacultyDashboard } from "./faculty-dashboard";
import { CoordinatorDashboard } from "./coordinator-dashboard";
import { StudentDashboardTables } from "./student-dashboard";
import { weeklyHistory } from "@/lib/services/complianceService";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

export default async function DashboardHomePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUserPage();

  if (STAFF_ROLES.includes(user.role)) {
    return (
      <div className="space-y-6">
        <PageHeader
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
  const reportHistory = studentProfile
    ? weeklyHistory(
        await prisma.weeklyReport.findMany({
          where: { studentProfileId: studentProfile.id },
          select: { id: true, weekStart: true, weekEnd: true, status: true, revisionHistory: true },
          orderBy: { weekStart: "desc" },
        })
      )
    : [];
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="My internship"
        description={finding}
        actions={
          <Button asChild>
            <Link href="/weekly-reports">This week&apos;s report</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* The screen's question, "am I on track?", gets the biggest block and the one hue. */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Confirmed hours</p>
            <p className="mt-1 text-3xl font-medium tracking-tight tabular-nums">
              {confirmedHours}
              <span className="text-lg text-muted-foreground"> / {requiredHours} hrs</span>
            </p>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Confirmed hours"
              aria-valuemin={0}
              aria-valuemax={requiredHours}
              aria-valuenow={confirmedHours}
            >
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>0</span>
              <span>{requiredHours} hrs</span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Pending review</dt>
                <dd className="mt-0.5 tabular-nums">
                  {pendingHours > 0 ? `+${pendingHours} hrs` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Projected finish</dt>
                <dd className="mt-0.5">
                  {projectedCompletion ? fmtDate(projectedCompletion) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Host company</dt>
                <dd className="mt-0.5">{studentProfile?.companyId ? "Assigned" : "Not yet"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Program</dt>
                <dd className="mt-0.5">{studentProfile?.program ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Waiting on you</CardTitle>
          </CardHeader>
          <CardContent>
            {attentionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is waiting on you right now.</p>
            ) : (
              <ul className="-mx-2">
                {attentionRows.map((row) => (
                  <li key={row.label}>
                    <Link
                      href={row.href}
                      className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="w-6 text-right font-medium tabular-nums">{row.count}</span>
                      <span className="flex-1">{row.label}</span>
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {studentProfile && finalThreshold !== null && (
              <div className="mt-4 border-t pt-4">
                <p className="text-sm font-medium">Final report cover</p>
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <StudentDashboardTables requirements={progress?.items ?? []} history={reportHistory} />
    </div>
  );
}
