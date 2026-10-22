import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { listClassGroups } from "@/lib/services/classGroupService";
import { listSemesters } from "@/lib/services/semesterService";
import { BulkImportForm } from "./import-form";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

export default async function BulkImportPage() {
  const user = await requireUserPage();
  if (!STAFF_ROLES.includes(user.role)) {
    redirect("/");
  }
  const [groups, semesters] = await Promise.all([listClassGroups(), listSemesters()]);
  const openSemesters = semesters.filter((s) => !s.archivedAt);

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
      <BulkImportForm
        classGroups={groups.map((g) => ({ id: g.id, label: `${g.name} (${g.program})` }))}
        semesters={openSemesters.map((s) => ({
          id: s.id,
          label: `${s.name} (${s.academicYear})${s.isActive ? " · active" : ""}`,
        }))}
        defaultSemesterId={openSemesters.find((s) => s.isActive)?.id}
      />
    </div>
  );
}
