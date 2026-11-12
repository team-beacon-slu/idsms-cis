import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { CompanyForm } from "./company-form";
import { PageHeader } from "@/components/page-header";

export default async function NewCompanyPage() {
  const user = await requireUserPage();
  const intern = user.role === "STUDENT_INTERN";
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
      <PageHeader
        title={intern ? "Register your host company" : "Register a company"}
        description={
          intern
            ? "Your adviser verifies it and the coordinator records the MOA. If your company is already listed, pick it as you type its name."
            : "Add a host company. Interns placed there can then pick it."
        }
      />
      <CompanyForm showPositionTitle={intern} />
    </div>
  );
}
