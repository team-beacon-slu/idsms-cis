import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Role } from "@prisma/client";
import {
  Users,
  Building2,
  FileClock,
  ClipboardCheck,
  NotebookText,
  Clock,
  FileText,
  CalendarDays,
  UserCircle,
  ArrowRight,
} from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getUserProfile } from "@/lib/services/userService";
import { getExpiringMoaRecords } from "@/lib/services/companyService";
import { getChecklistProgress } from "@/lib/services/checklistService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";

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
      description: "Log daily hours",
    });
    links.push({
      href: "/weekly-reports",
      label: "Weekly Reports",
      icon: FileText,
      description: "Submit weekly reports",
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

export default async function DashboardHomePage() {
  const user = await requireUserPage();
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;

  let stats: React.ReactNode = null;

  if (STAFF_ROLES.includes(user.role)) {
    const [totalUsers, totalCompanies, verifiedCompanies, expiringMoas] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.company.count({ where: { deletedAt: null, isVerified: true } }),
      getExpiringMoaRecords(30),
    ]);

    stats = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={totalUsers} icon={Users} tone="blue" />
        <StatCard
          label="Registered companies"
          value={totalCompanies}
          icon={Building2}
          tone="slate"
        />
        <StatCard
          label="Verified companies"
          value={verifiedCompanies}
          icon={Building2}
          tone="green"
        />
        <StatCard
          label="MOAs expiring soon"
          value={expiringMoas.length}
          icon={FileClock}
          tone={expiringMoas.length > 0 ? "amber" : "slate"}
          hint="Next 30 days"
        />
      </div>
    );
  } else if (user.role === Role.FACULTY_ADVISER) {
    const classGroups = await prisma.facultyClassGroup.findMany({
      where: { facultyId: user.id },
      select: { classGroupId: true, semesterId: true },
    });
    const studentCount =
      classGroups.length === 0
        ? 0
        : await prisma.studentProfile.count({
            where: {
              OR: classGroups.map((g) => ({
                classGroupId: g.classGroupId,
                semesterId: g.semesterId,
              })),
            },
          });

    stats = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Assigned class groups"
          value={classGroups.length}
          icon={ClipboardCheck}
          tone="blue"
        />
        <StatCard label="My students" value={studentCount} icon={Users} tone="green" />
      </div>
    );
  } else if (user.role === Role.STUDENT_INTERN) {
    const profile = await getUserProfile(user.id);
    const studentProfile = profile?.studentProfile;
    const progress = studentProfile ? await getChecklistProgress(studentProfile.id) : null;

    stats = (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
