import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { MoaForm } from "./moa-form";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// FR-MOA-07: MOA records are staff-only — students never reach this page.
export default async function NewMoaPage({ params }: { params: { id: string } }) {
  const user = await requireUserPage();
  if (!STAFF_ROLES.includes(user.role)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/companies/${params.id}`}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to company
        </Link>
      </div>
      <MoaForm companyId={params.id} />
    </div>
  );
}
