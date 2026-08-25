import { requireUserPage } from "@/lib/auth/session";
import { CompanyForm } from "./company-form";

export default async function NewCompanyPage() {
  const user = await requireUserPage();
  return <CompanyForm showPositionTitle={user.role === "STUDENT_INTERN"} />;
}
