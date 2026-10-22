"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Role } from "@prisma/client";
import {
  LayoutDashboard,
  Users,
  UsersRound,
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
  Settings,
  UserCircle,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark, BrandTile } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "./notification-bell";

// The desktop sidebar folds to an icon rail; its state is a cookie so the server renders
// the right width and nothing jumps on load. Inside the aside, these variants hide text
// while the rail is folded (the phone drawer has no such group, so it always shows it).
// The dashboard layout reads the same cookie name.
const SIDEBAR_COOKIE = "sidebar";
const RAIL_HIDE = "group-data-[collapsed=true]/side:sr-only";
const RAIL_CENTER =
  "group-data-[collapsed=true]/side:justify-center group-data-[collapsed=true]/side:px-0";

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
        { href: "/class-groups", label: "Class groups", icon: UsersRound },
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
        { href: "/settings", label: "Settings", icon: Settings },
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
  "flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm md:h-9 text-sidebar-foreground/80 transition-colors hover:bg-brand-50 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

function NavLinks({
  groups,
  pathname,
  onNavigate,
  rail,
  id,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
  /** Folded to icons: each link keeps its name as a tooltip. */
  rail?: boolean;
  id?: string;
}) {
  return (
    <nav id={id} aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2">
      {groups.map((group, i) => (
        <div key={group.label ?? i} className="flex flex-col gap-0.5">
          {group.label && (
            <p className={cn("px-2.5 pb-1 text-xs text-sidebar-foreground/60", RAIL_HIDE)}>
              {group.label}
            </p>
          )}
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={rail ? label : undefined}
                className={cn(
                  rowClass,
                  RAIL_CENTER,
                  active && "btn-glow font-medium text-white hover:bg-transparent hover:text-white"
                )}
              >
                <Icon
                  className={cn("size-4 shrink-0", active && "text-white")}
                  strokeWidth={active ? 2 : 1.6}
                  aria-hidden="true"
                />
                <span className={RAIL_HIDE}>{label}</span>
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
  rail,
  onToggleRail,
}: {
  userLabel?: string;
  role: Role;
  pathname: string;
  onNavigate?: () => void;
  rail?: boolean;
  /** Desktop only: folds or unfolds the sidebar. */
  onToggleRail?: () => void;
}) {
  const profileActive = isActive(pathname, "/profile");
  return (
    <div className="flex flex-col gap-0.5 border-t border-sidebar-border p-3">
      <Link
        href="/profile"
        onClick={onNavigate}
        aria-current={profileActive ? "page" : undefined}
        title="Profile & preferences"
        className={cn(
          rowClass,
          RAIL_CENTER,
          "h-auto py-1.5",
          profileActive && "bg-sidebar-accent text-sidebar-foreground"
        )}
      >
        <UserCircle className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
        <span className={cn("min-w-0", RAIL_HIDE)}>
          <span className="block truncate font-medium text-sidebar-foreground">
            {userLabel ?? "Profile"}
          </span>
          <span className="block truncate text-xs text-sidebar-foreground/60">
            {ROLE_LABEL[role]}
          </span>
        </span>
      </Link>
      <ThemeToggle
        className={cn(rowClass, RAIL_CENTER, "cursor-pointer")}
        labelClassName={RAIL_HIDE}
      />
      <button
        type="button"
        title={rail ? "Sign out" : undefined}
        className={cn(rowClass, RAIL_CENTER, "cursor-pointer")}
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
        <span className={RAIL_HIDE}>Sign out</span>
      </button>
      {onToggleRail && (
        <button
          type="button"
          onClick={onToggleRail}
          aria-expanded={!rail}
          aria-controls="sidebar-nav"
          title={rail ? "Expand sidebar" : undefined}
          className={cn(rowClass, RAIL_CENTER, "cursor-pointer")}
        >
          {rail ? (
            <PanelLeftOpen className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          )}
          <span className={RAIL_HIDE}>{rail ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
      )}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      {compact ? <BrandTile className="size-8" /> : <BrandMark className="size-9 shrink-0" />}
      <span className={cn("min-w-0 leading-tight", RAIL_HIDE)}>
        <span className="block text-[15px] font-bold tracking-tight text-brand-900">IDSMS-CIS</span>
        <span className="block truncate text-xs text-sidebar-foreground/65">SAMCIS · SLU</span>
      </span>
    </Link>
  );
}

export function DashboardNav({
  role,
  userLabel,
  initialCollapsed = false,
}: {
  role: Role;
  userLabel?: string;
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [rail, setRail] = useState(initialCollapsed);
  const groups = getNavGroups(role);
  const close = () => setMobileOpen(false);
  const toggleRail = () => {
    const next = !rail;
    setRail(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <>
      {/* Desktop: the sidebar sits on the page ground, divided by one hairline. The
          layout's main column reads data-collapsed to match its padding. */}
      <aside
        data-collapsed={rail}
        className="group/side hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:w-60 md:flex-col md:border-r md:border-white/60 md:bg-white/55 md:backdrop-blur-xl md:transition-[width] md:duration-200 md:data-[collapsed=true]:w-[72px] dark:md:border-white/8 dark:md:bg-card/55"
      >
        <div className="flex h-16 items-center gap-2 px-5 group-data-[collapsed=true]/side:h-auto group-data-[collapsed=true]/side:flex-col group-data-[collapsed=true]/side:px-0 group-data-[collapsed=true]/side:py-3">
          <Brand />
          <NotificationBell className="ml-auto group-data-[collapsed=true]/side:ml-0" />
        </div>
        <NavLinks id="sidebar-nav" groups={groups} pathname={pathname} rail={rail} />
        <AccountRow
          userLabel={userLabel}
          role={role}
          pathname={pathname}
          rail={rail}
          onToggleRail={toggleRail}
        />
      </aside>

      {/* Phone: a 48px bar with the product, the bell and the menu. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-1 border-b border-white/60 bg-white/75 px-4 backdrop-blur-xl md:hidden dark:border-white/8 dark:bg-card/75">
        <Brand compact />
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
          <div className="flex h-14 items-center border-b border-sidebar-border px-4">
            <Brand compact />
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
