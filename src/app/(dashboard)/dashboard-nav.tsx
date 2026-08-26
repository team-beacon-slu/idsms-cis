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
  ClipboardCheck,
  FileText,
  Clock,
  NotebookText,
  UserCircle,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];
// Coordinator/Admin already have the full roster via /users — this page's
// only real content is the faculty_class_groups join, which only ever has
// rows for FACULTY_ADVISER.
const MY_STUDENTS_ROLES: Role[] = [Role.FACULTY_ADVISER];

type NavItem = { href: string; label: string; icon: LucideIcon };

function getNavItems(role: Role): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "Dashboard", icon: LayoutDashboard }];

  if (STAFF_ROLES.includes(role)) {
    items.push({ href: "/users", label: "Users", icon: Users });
  }
  items.push({ href: "/companies", label: "Companies", icon: Building2 });
  items.push({ href: "/calendar", label: "Calendar", icon: Calendar });
  if (MY_STUDENTS_ROLES.includes(role)) {
    items.push({ href: "/my-students", label: "My Students", icon: Users });
  }
  if (role === Role.STUDENT_INTERN) {
    items.push({ href: "/checklist", label: "Checklist", icon: ClipboardCheck });
    items.push({ href: "/work-plan", label: "Work Plan", icon: NotebookText });
    items.push({ href: "/attendance", label: "Attendance", icon: Clock });
    items.push({ href: "/weekly-reports", label: "Weekly Reports", icon: FileText });
  }
  items.push({ href: "/profile", label: "Profile", icon: UserCircle });

  return items;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              active &&
                "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardNav({ role, userEmail }: { role: Role; userEmail?: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = getNavItems(role);

  return (
    <>
      {/* Desktop sidebar — fixed dark-navy chrome, per the thesis prototype's left-nav layout */}
      <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
        <div className="flex h-16 items-center gap-2 px-6">
          <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">
            IDSMS-CIS
          </span>
        </div>
        <NavLinks items={items} pathname={pathname} />
        <div className="mt-auto border-t border-sidebar-border p-3">
          {userEmail && (
            <p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/60">{userEmail}</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar + slide-over drawer */}
      <header className="flex h-14 items-center justify-between border-b bg-sidebar px-4 md:hidden">
        <span className="text-base font-semibold text-sidebar-foreground">IDSMS-CIS</span>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="cursor-pointer rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 flex w-72 flex-col bg-sidebar shadow-xl">
            <div className="flex h-16 items-center justify-between px-6">
              <span className="text-lg font-semibold text-sidebar-foreground">IDSMS-CIS</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="cursor-pointer rounded-md p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <NavLinks items={items} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto border-t border-sidebar-border p-3">
              {userEmail && (
                <p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/60">{userEmail}</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="size-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
