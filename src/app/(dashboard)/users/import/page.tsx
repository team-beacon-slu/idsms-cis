import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { BulkImportForm } from "./import-form";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

export default async function BulkImportPage() {
  const user = await requireUserPage();
  if (!STAFF_ROLES.includes(user.role)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/users"
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Bulk import students
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the official SLU class list to create student accounts in one pass.
        </p>
      </div>
      <BulkImportForm />
    </div>
  );
}
