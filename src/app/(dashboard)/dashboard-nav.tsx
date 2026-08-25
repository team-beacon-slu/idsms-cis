"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

export function DashboardNav({ role }: { role: Role }) {
  return (
    <nav className="flex items-center justify-between border-b p-4">
      <div className="flex items-center gap-4">
        <Link href="/" className="font-semibold">
          IDSMS-CIS
        </Link>
        {STAFF_ROLES.includes(role) && (
          <Link href="/users" className="text-sm text-muted-foreground hover:underline">
            Users
          </Link>
        )}
        <Link href="/profile" className="text-sm text-muted-foreground hover:underline">
          Profile
        </Link>
      </div>
      <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
        Sign out
      </Button>
    </nav>
  );
}
