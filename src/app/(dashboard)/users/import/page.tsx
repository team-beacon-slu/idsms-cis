import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { BulkImportForm } from "./import-form";

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

export default async function BulkImportPage() {
  const user = await requireUserPage();
  if (!STAFF_ROLES.includes(user.role)) {
    redirect("/");
  }

  return <BulkImportForm />;
}
