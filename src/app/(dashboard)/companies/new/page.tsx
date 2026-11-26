import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listPlacementsForStudent } from "@/lib/services/predeployment/placementService";
import { CompanyForm } from "./company-form";
import { PlacementHistory } from "../placement-history";
import { PageHeader } from "@/components/page-header";

export default async function NewCompanyPage() {
  const user = await requireUserPage();
  const intern = user.role === "STUDENT_INTERN";
  const profile = intern
    ? await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    : null;
  const placements = profile ? await listPlacementsForStudent(profile.id) : [];
  // After a pull-out or transfer the intern adds their next company here.
  const another = placements.length > 0;
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
        title={
          intern
            ? another
              ? "Add your next host company"
              : "Register your host company"
            : "Register a company"
        }
        description={
          intern
            ? another
              ? "You were pulled out or transferred. Add the company (or the school) where you continue; your hours so far carry over. If it is already listed, pick it as you type its name."
              : "Your adviser verifies it and the coordinator records the MOA. If your company is already listed, pick it as you type its name."
            : "Add a host company. Interns placed there can then pick it."
        }
      />
      <CompanyForm showPositionTitle={intern} />
      <PlacementHistory placements={placements} />
    </div>
  );
}
