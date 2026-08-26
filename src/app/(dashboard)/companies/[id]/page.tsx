import { notFound } from "next/navigation";
import Link from "next/link";
import { Role } from "@prisma/client";
import { MapPin, Briefcase, User, Phone, ShieldCheck, Plus, Lock } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import {
  ALLOWED_MOA_TRANSITIONS,
  getCompany,
  listMoaRecordsForCompany,
} from "@/lib/services/companyService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CompanyVerifyToggle } from "./company-verify-toggle";
import { MoaStatusActions } from "./moa-status-actions";

const STAFF_ROLES: Role[] = [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN];

function VerificationPill({ isVerified }: { isVerified: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
        isVerified
          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400"
          : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300"
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", isVerified ? "bg-green-500" : "bg-slate-400")}
        aria-hidden="true"
      />
      {isVerified ? "Verified" : "Unverified"}
    </span>
  );
}

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUserPage();
  const company = await getCompany(params.id);
  if (!company) {
    notFound();
  }

  const isStaff = STAFF_ROLES.includes(user.role);
  // FR-MOA-07: MOA records are restricted to staff — never fetched or shown
  // to a student, not even an empty list.
  const moaRecords = isStaff ? await listMoaRecordsForCompany(params.id) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {company.name}
            <VerificationPill isVerified={company.isVerified} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{company.address}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Briefcase className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>Modality: {company.workModality}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <User className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>{company.supervisorName}</span>
            <Phone className="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">{company.supervisorContact}</span>
          </div>

          {isStaff && (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Lock className="size-3.5" aria-hidden="true" />
                Staff
              </div>
              <CompanyVerifyToggle companyId={company.id} isVerified={company.isVerified} />
            </div>
          )}
        </CardContent>
      </Card>

      {isStaff && (
        <Card className="border-primary/20">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="flex items-center gap-2">
                MOA records
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  Staff only
                </span>
              </CardTitle>
            </div>
            <Button asChild size="sm" className="cursor-pointer">
              <Link href={`/companies/${company.id}/moa/new`} className="gap-1.5">
                <Plus className="size-4" aria-hidden="true" />
                Add MOA
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableCaption className="sr-only">MOA records for {company.name}</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Valid from</TableHead>
                    <TableHead>Valid to</TableHead>
                    <TableHead>Programs</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moaRecords.map((moa) => (
                    <TableRow key={moa.id}>
                      <TableCell>
                        <StatusBadge status={moa.status} />
                      </TableCell>
                      <TableCell>{new Date(moa.validFrom).toLocaleDateString()}</TableCell>
                      <TableCell>{new Date(moa.validTo).toLocaleDateString()}</TableCell>
                      <TableCell>{moa.programsCovered.join(", ")}</TableCell>
                      <TableCell>
                        <MoaStatusActions
                          moaId={moa.id}
                          nextStatuses={ALLOWED_MOA_TRANSITIONS[moa.status]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {moaRecords.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No MOA records yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
