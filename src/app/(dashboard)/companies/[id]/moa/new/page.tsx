import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { MoaForm } from "./moa-form";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

// FR-MOA-07: MOA records are staff-only — students never reach this page.
export default async function NewMoaPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await props.params;
  const { renew } = await props.searchParams;
  const user = await requireUserPage();
  if (!STAFF_ROLES.includes(user.role)) {
    redirect("/");
  }
  // ?renew=<moaId>: prefill from that MOA of this company (a foreign or bad id is ignored).
  const old =
    typeof renew === "string" && z.uuid().safeParse(renew).success
      ? await prisma.moaRecord.findFirst({
          where: { id: renew, companyId: params.id },
          select: { validTo: true, programsCovered: true },
        })
      : null;
  const renewal = old && {
    validFrom: new Date(old.validTo.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    programsCovered: old.programsCovered,
  };

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
      <MoaForm companyId={params.id} renewal={renewal ?? undefined} />
    </div>
  );
}
