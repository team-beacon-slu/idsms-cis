import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@prisma/client";
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
import { UserRowActions } from "./user-row-actions";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

export default async function UsersPage() {
  const currentUser = await requireUserPage();
  if (!STAFF_ROLES.includes(currentUser.role)) {
    redirect("/");
  }

  const { users } = await listUsers();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <Button asChild>
          <Link href="/users/import">Bulk import students</Link>
        </Button>
      </div>
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
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{user.role}</Badge>
              </TableCell>
              <TableCell>
                {user.lockedUntil && user.lockedUntil > new Date() ? (
                  <Badge variant="destructive">Locked</Badge>
                ) : user.isActive ? (
                  <Badge variant="outline">Active</Badge>
                ) : (
                  <Badge variant="destructive">Deactivated</Badge>
                )}
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
        </TableBody>
      </Table>
    </div>
  );
}
