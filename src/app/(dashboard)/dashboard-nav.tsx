"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Role } from "@prisma/client";
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  CalendarRange,
  ClipboardCheck,
  FileText,
  FileBarChart2,
  Clock,
  CalendarOff,
  NotebookText,
  BookOpenCheck,
  ScrollText,
  Download,
  UserCircle,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { NotificationBell } from "./notification-bell";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label?: string; items: NavItem[] };

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT_INTERN: "Student intern",
  FACULTY_ADVISER: "Faculty adviser",
  DEPARTMENT_COORDINATOR: "Department coordinator",
  SUPER_ADMIN: "Super admin",
};

const REFERENCE: NavGroup = {
  label: "Reference",
  items: [
    { href: "/companies", label: "Companies", icon: Building2 },
    { href: "/calendar", label: "Calendar", icon: Calendar },
  ],
};

// Grouped by what each role does there, so a new screen has an obvious home.
// Coordinator/Admin reach every student through /users and the dashboard; My students
// is the faculty_class_groups roster, which only faculty have.
export function getNavGroups(role: Role): NavGroup[] {
  const home: NavGroup = { items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }] };
  if (role === Role.STUDENT_INTERN) {
    return [
      home,
      {
        label: "Every week",
        items: [
          { href: "/weekly-reports", label: "Weekly reports", icon: FileText },
          { href: "/attendance", label: "Attendance", icon: Clock },
          { href: "/leave-requests", label: "Leave & time requests", icon: CalendarOff },
        ],
      },
      {
        label: "Requirements",
        items: [
          { href: "/checklist", label: "Checklist", icon: ClipboardCheck },
          { href: "/work-plan", label: "Work plan", icon: NotebookText },
          { href: "/monthly-reports", label: "Monthly reports", icon: FileBarChart2 },
          { href: "/final-report", label: "Final report", icon: BookOpenCheck },
        ],
      },
      REFERENCE,
    ];
  }
  if (role === Role.FACULTY_ADVISER) {
    return [
      { items: [...home.items, { href: "/my-students", label: "My students", icon: Users }] },
      REFERENCE,
    ];
  }
  const groups: NavGroup[] = [
    home,
    {
      label: "Manage",
      items: [
        { href: "/users", label: "Users", icon: Users },
        { href: "/semesters", label: "Semesters", icon: CalendarRange },
        { href: "/final-reports", label: "Final reports", icon: BookOpenCheck },
      ],
    },
  ];
  if (role === Role.SUPER_ADMIN) {
    groups.push({
      label: "Records",
      items: [
        { href: "/audit-log", label: "Audit log", icon: ScrollText },
        { href: "/admin/export-center", label: "Export center", icon: Download },
      ],
    });
  }
  return [...groups, REFERENCE];
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const rowClass =
  "flex h-11 items-center gap-2.5 rounded-md px-2.5 text-sm md:h-8 text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

function NavLinks({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2">
      {groups.map((group, i) => (
        <div key={group.label ?? i} className="flex flex-col gap-0.5">
          {group.label && (
            <p className="px-2.5 pb-1 text-xs text-sidebar-foreground/60">{group.label}</p>
          )}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  rowClass,
                  active &&
                    "bg-sidebar-accent font-medium text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function AccountRow({
  userLabel,
  role,
  pathname,
  onNavigate,
}: {
  userLabel?: string;
  role: Role;
  pathname: string;
  onNavigate?: () => void;
}) {
  const profileActive = isActive(pathname, "/profile");
  return (
    <div className="flex flex-col gap-0.5 border-t border-sidebar-border p-3">
      <Link
        href="/profile"
        onClick={onNavigate}
        aria-current={profileActive ? "page" : undefined}
        className={cn(
          rowClass,
          "h-auto py-1.5",
          profileActive && "bg-sidebar-accent text-sidebar-foreground"
        )}
      >
        <UserCircle className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-sidebar-foreground">
            {userLabel ?? "Profile"}
          </span>
          <span className="block truncate text-xs text-sidebar-foreground/60">
            {ROLE_LABEL[role]}
          </span>
        </span>
      </Link>
      <button
        type="button"
        className={cn(rowClass, "cursor-pointer")}
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <BrandMark className="size-7" />
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-semibold text-sidebar-foreground">IDSMS-CIS</span>
        <span className="block truncate text-xs text-sidebar-foreground/60">
          Internship monitoring
        </span>
      </span>
    </Link>
  );
}

export function DashboardNav({ role, userLabel }: { role: Role; userLabel?: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = getNavGroups(role);
  const close = () => setMobileOpen(false);

  return (
    <>
      {/* Desktop: the sidebar sits on the page ground, divided by one hairline. */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:w-60 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
        <div className="flex h-16 items-center gap-2 px-5">
          <Brand />
          <NotificationBell className="ml-auto" />
        </div>
        <NavLinks groups={groups} pathname={pathname} />
        <AccountRow userLabel={userLabel} role={role} pathname={pathname} />
      </aside>

      {/* Phone: a 48px bar with the product, the bell and the menu. */}
      <header className="sticky top-0 z-40 flex h-12 items-center gap-1 border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <Brand />
        <NotificationBell className="ml-auto" />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileOpen}
          className="flex size-11 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/75 hover:bg-sidebar-accent"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-sidebar md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="flex h-12 items-center border-b border-sidebar-border px-4">
            <Brand />
            <button
              type="button"
              onClick={close}
              aria-label="Close navigation menu"
              className="ml-auto flex size-11 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/75 hover:bg-sidebar-accent"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <NavLinks groups={groups} pathname={pathname} onNavigate={close} />
          <AccountRow userLabel={userLabel} role={role} pathname={pathname} onNavigate={close} />
        </div>
      )}
    </>
  );
}
