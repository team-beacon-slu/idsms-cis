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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { cn } from "@/lib/utils";
import { UserRowActions } from "./user-row-actions";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

function humanizeRole(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function AccountStatusPill({ locked, active }: { locked: boolean; active: boolean }) {
  const label = locked ? "Locked" : active ? "Active" : "Deactivated";
  const toneClasses = locked
    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
    : active
      ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20"
      : "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20";
  const dotClasses = locked ? "bg-blue-500" : active ? "bg-green-500" : "bg-red-500";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
        toneClasses
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotClasses)} aria-hidden="true" />
      {label}
    </span>
  );
}

export default async function UsersPage() {
  const currentUser = await requireUserPage();
  if (!STAFF_ROLES.includes(currentUser.role)) {
    redirect("/");
  }

  const [{ users, total }, { total: activeTotal }] = await Promise.all([
    listUsers(),
    listUsers({ isActive: true }),
  ]);
  const inactiveTotal = total - activeTotal;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage accounts, roles, and access across the department.
          </p>
        </div>
        <Button asChild className="cursor-pointer">
          <Link href="/users/import" className="gap-2">
            <Upload className="size-4" aria-hidden="true" />
            Bulk import students
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total users" value={total} icon={UsersIcon} tone="blue" />
        <StatCard label="Active" value={activeTotal} icon={UserCheck} tone="green" />
        <StatCard
          label="Deactivated"
          value={inactiveTotal}
          icon={UserX}
          tone={inactiveTotal > 0 ? "red" : "slate"}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium text-foreground">{user.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{humanizeRole(user.role)}</Badge>
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
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
