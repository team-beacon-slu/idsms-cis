import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@prisma/client";
import { Users as UsersIcon, UserCheck, UserX, Upload } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { listUsers } from "@/lib/services/userService";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard, StatStrip } from "@/components/stat-card";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { UserRowActions } from "./user-row-actions";
import { CreateStaffForm } from "./create-staff-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Users" };

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

const PAGE_SIZE = 25;
const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: Role.STUDENT_INTERN, label: "Student intern" },
  { value: Role.FACULTY_ADVISER, label: "Faculty adviser" },
  { value: Role.DEPARTMENT_COORDINATOR, label: "Department coordinator" },
  { value: Role.SUPER_ADMIN, label: "Super admin" },
];
const roleLabel = (role: Role) => ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function AccountStatusPill({ locked, active }: { locked: boolean; active: boolean }) {
  const label = locked ? "Locked" : active ? "Active" : "Deactivated";
  // Locked needs attention (amber notice pair); deactivated is a state, not an error.
  const toneClasses = locked
    ? "bg-notice text-notice-foreground border-notice-border"
    : active
      ? "bg-green-50 text-green-800 border-green-200"
      : "bg-muted text-muted-foreground border-border";
  const dotClasses = locked ? "bg-amber-500" : active ? "bg-green-600" : "bg-slate-400";

  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotClasses)} aria-hidden="true" />
      {label}
    </span>
  );
}

export default async function UsersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const currentUser = await requireUserPage();
  // Filters live in the URL (a plain GET form), so a filtered list can be shared or bookmarked.
  const q = first(searchParams.q)?.trim() || undefined;
  const roleParam = first(searchParams.role);
  const role = ROLE_OPTIONS.some((o) => o.value === roleParam) ? (roleParam as Role) : undefined;
  const page = Math.max(1, Number.parseInt(first(searchParams.page) ?? "1", 10) || 1);
  if (!STAFF_ROLES.includes(currentUser.role)) {
    redirect("/");
  }

  const isSuperAdmin = currentUser.role === Role.SUPER_ADMIN;
  const [{ total }, { total: activeTotal }, listed] = await Promise.all([
    listUsers({ pageSize: 1 }),
    listUsers({ isActive: true, pageSize: 1 }),
    listUsers({ search: q, role, page, pageSize: PAGE_SIZE }),
  ]);
  const inactiveTotal = total - activeTotal;
  const { users, total: matching } = listed;
  const from = matching === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, matching);
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (p > 1) params.set("page", String(p));
    const query = params.toString();
    return `/users${query ? `?${query}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Accounts, roles and access across the department."
        actions={
          <Button asChild className="cursor-pointer">
            <Link href="/users/import" className="gap-2">
              <Upload className="size-4" aria-hidden="true" />
              Bulk import students
            </Link>
          </Button>
        }
      />

      <StatStrip>
        <StatCard label="Total users" value={total} icon={UsersIcon} />
        <StatCard label="Active" value={activeTotal} icon={UserCheck} />
        <StatCard label="Deactivated" value={inactiveTotal} icon={UserX} />
      </StatStrip>

      <section aria-label="Accounts" className="space-y-3">
        <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="user-search">Search</Label>
            <Input
              id="user-search"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Name, email or student number"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-role">Role</Label>
            <select
              id="user-role"
              name="role"
              defaultValue={role ?? ""}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-56"
            >
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <p className="text-sm text-muted-foreground" role="status">
          {matching === 0
            ? "No accounts match."
            : `Showing ${from}–${to} of ${matching} ${matching === 1 ? "account" : "accounts"}`}
        </p>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <span className="block font-medium text-foreground">
                      {user.name || user.email}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {user.name ? user.email : null}
                      {user.studentNumber ? `${user.name ? " · " : ""}${user.studentNumber}` : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{roleLabel(user.role)}</Badge>
                  </TableCell>
                  <TableCell>
                    <AccountStatusPill
                      locked={Boolean(user.lockedUntil && user.lockedUntil > new Date())}
                      active={user.isActive}
                    />
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      userId={user.id}
                      isActive={user.isActive}
                      isLocked={Boolean(user.lockedUntil && user.lockedUntil > new Date())}
                      disabled={user.id === currentUser.id}
                      canSuperAdmin={currentUser.role === Role.SUPER_ADMIN}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {q || role ? "No accounts match these filters." : "No accounts yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {matching > PAGE_SIZE && (
          <nav aria-label="Pages" className="flex items-center justify-end gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page - 1)}>Previous</Link>
              </Button>
            )}
            {to < matching && (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(page + 1)}>Next</Link>
              </Button>
            )}
          </nav>
        )}
      </section>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>New staff account</CardTitle>
            <CardDescription>
              Faculty advisers, coordinators and admins. Students are added by importing the class
              list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateStaffForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
