import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { CompanyForm } from "./company-form";

export default async function NewCompanyPage() {
  const user = await requireUserPage();
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/companies"
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to companies
        </Link>
      </div>
      <CompanyForm showPositionTitle={user.role === "STUDENT_INTERN"} />
    </div>
  );
}
