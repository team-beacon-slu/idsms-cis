import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { MoaForm } from "./moa-form";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// FR-MOA-07: MOA records are staff-only — students never reach this page.
export default async function NewMoaPage({ params }: { params: { id: string } }) {
  const user = await requireUserPage();
  if (!STAFF_ROLES.includes(user.role)) {
    redirect("/");
  }

  return <MoaForm companyId={params.id} />;
}
