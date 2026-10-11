import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Role } from "@prisma/client";
import {
  Users,
  Building2,
  ClipboardCheck,
  NotebookText,
  Clock,
  FileText,
  CalendarDays,
  UserCircle,
  ArrowRight,
  Timer,
  CalendarCheck,
  FileBarChart2,
} from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { FacultyDashboard } from "./faculty-dashboard";
import { CoordinatorDashboard } from "./coordinator-dashboard";
import { StudentDashboardTables } from "./student-dashboard";
import { weeklyHistory } from "@/lib/services/complianceService";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  DEPARTMENT_COORDINATOR: "Department Coordinator",
  FACULTY_ADVISER: "Faculty Adviser",
  STUDENT_INTERN: "Student Intern",
};

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

type QuickLink = { href: string; label: string; icon: LucideIcon; description: string };

function getQuickLinks(role: Role): QuickLink[] {
  const links: QuickLink[] = [];
  if (STAFF_ROLES.includes(role)) {
    links.push({
      href: "/users",
      label: "Users",
      icon: Users,
      description: "Manage accounts and roles",
    });
  }
  links.push({
    href: "/companies",
    label: "Companies",
    icon: Building2,
    description: "Browse host companies",
  });
  links.push({
    href: "/calendar",
    label: "Calendar",
    icon: CalendarDays,
    description: "Deadlines, holidays, milestones",
  });
  if (role === Role.FACULTY_ADVISER) {
    links.push({
      href: "/my-students",
      label: "My Students",
      icon: Users,
      description: "Your assigned roster",
    });
  }
  if (role === Role.STUDENT_INTERN) {
    links.push({
      href: "/checklist",
      label: "Checklist",
      icon: ClipboardCheck,
      description: "Pre-deployment requirements",
    });
    links.push({
      href: "/work-plan",
      label: "Work Plan",
      icon: NotebookText,
      description: "Your OJT work plan",
    });
    links.push({
      href: "/attendance",
      label: "Attendance",
      icon: Clock,
      description: "Schedule, hours, deviations",
    });
    links.push({
      href: "/weekly-reports",
      label: "Weekly Reports",
      icon: FileText,
      description: "Submit weekly reports",
    });
    links.push({
      href: "/monthly-reports",
      label: "Monthly Reports",
      icon: FileBarChart2,
      description: "Roll up approved weeks",
    });
  }
  links.push({
    href: "/profile",
    label: "Profile",
    icon: UserCircle,
    description: "Account details",
  });
  return links;
}

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await requireUserPage();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  let stats: React.ReactNode = null;

  if (STAFF_ROLES.includes(user.role)) {
    stats = <CoordinatorDashboard role={user.role} searchParams={searchParams} />;
  } else if (user.role === Role.FACULTY_ADVISER) {
    stats = <FacultyDashboard facultyId={user.id} />;
  } else if (user.role === Role.STUDENT_INTERN) {
    const profile = await getUserProfile(user.id);
    const studentProfile = profile?.studentProfile;
    const [progress, hours, projectedCompletion, reportsNeedingAction] = studentProfile
      ? await Promise.all([
          getChecklistProgress(studentProfile.id),
          getHoursSummary(studentProfile.id),
          computeProjectedCompletionDate(studentProfile.id),
          prisma.weeklyReport.count({
            where: {
              studentProfileId: studentProfile.id,
              status: { in: ["PENDING", "RETURNED"] },
            },
          }),
        ])
      : [null, null, null, 0];
    const confirmedHours = hours?.confirmedHours ?? 0;
    const requiredHours = hours?.requiredHours ?? 0;
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
            select: {
              id: true,
              weekStart: true,
              weekEnd: true,
              status: true,
              revisionHistory: true,
            },
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
            label: "Deviation reports awaiting validation",
            href: "/attendance",
          },
          {
            count: attention.incompleteChecklistItems,
            label: "Checklist items not yet approved",
            href: "/checklist",
          },
        ].filter((row) => row.count > 0)
      : [];

    stats = (
      <>
        {attentionRows.length > 0 && (
          <Card className="mb-4 border-amber-300 dark:border-amber-500/40">
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Items that need action from you (FR-NT-03).</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
                {attentionRows.map((row) => (
                  <li key={row.label}>
                    <Link
                      href={row.href}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <span>{row.label}</span>
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {row.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {studentProfile && finalThreshold !== null && (
          <Card className="mb-4">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Final report cover</CardTitle>
                  <CardDescription>
                    {coverUnlocked
                      ? "Unlocked — generate the cover page for your final internship report."
                      : `Unlocks at ${finalThreshold} confirmed hours (${confirmedHours} / ${finalThreshold} so far).`}
                  </CardDescription>
                </div>
                <ReportPdfActions
                  endpoint={`/api/students/${studentProfile.id}/final-cover`}
                  status={finalCover?.status ?? null}
                  canGenerate={coverUnlocked}
                />
              </div>
            </CardHeader>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Hours rendered (confirmed)"
            value={`${confirmedHours} / ${requiredHours}`}
            icon={Timer}
            tone="blue"
            hint={
              hours && hours.pendingHours > 0
                ? `+${hours.pendingHours} hrs pending review`
                : requiredHours > 0
                  ? `${Math.min(100, Math.round((confirmedHours / requiredHours) * 100))}% of required hours`
                  : undefined
            }
          />
          <StatCard
            label="Projected completion"
            value={
              projectedCompletion
                ? projectedCompletion.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"
            }
            icon={CalendarCheck}
            tone={projectedCompletion ? "green" : "slate"}
            hint={projectedCompletion ? "Based on your schedule" : "Set your work schedule first"}
          />
          <StatCard
            label="Weekly reports in progress"
            value={reportsNeedingAction}
            icon={FileText}
            tone={reportsNeedingAction > 0 ? "amber" : "slate"}
            hint="Drafts, submitted, or returned"
          />
          <StatCard
            label="Pre-deployment checklist"
            value={progress ? `${progress.approvedCount}/${progress.total}` : "—"}
            icon={ClipboardCheck}
            tone={progress?.gateSatisfied ? "green" : "amber"}
            hint={progress ? `${progress.percentage}% approved` : undefined}
          />
          <StatCard
            label="Host company"
            value={studentProfile?.companyId ? "Assigned" : "Not yet"}
            icon={Building2}
            tone={studentProfile?.companyId ? "green" : "slate"}
          />
          <StatCard
            label="Program"
            value={studentProfile?.program ?? "—"}
            icon={UserCircle}
            tone="blue"
          />
        </div>
        <StudentDashboardTables requirements={progress?.items ?? []} history={reportHistory} />
      </>
    );
  }

  const quickLinks = getQuickLinks(user.role);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {user.email}
          </h1>
        </div>
        <Badge variant="secondary" className="w-fit">
          {roleLabel}
        </Badge>
      </div>

      {stats}

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Jump back into what you were working on.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors duration-200 hover:border-primary/40 hover:bg-accent"
              >
                <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
                  <link.icon className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{link.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{link.description}</p>
                </div>
                <ArrowRight
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
