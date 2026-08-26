import { notFound } from "next/navigation";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import {
  ALLOWED_MOA_TRANSITIONS,
  getCompany,
  listMoaRecordsForCompany,
} from "@/lib/services/companyService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          <CardTitle className="flex items-center gap-2">
            {company.name}
            <Badge variant={company.isVerified ? "outline" : "secondary"}>
              {company.isVerified ? "Verified" : "Unverified"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{company.address}</p>
          <p className="text-sm">Modality: {company.workModality}</p>
          <p className="text-sm">
            Supervisor: {company.supervisorName} ({company.supervisorContact})
          </p>
          {isStaff && (
            <CompanyVerifyToggle companyId={company.id} isVerified={company.isVerified} />
          )}
        </CardContent>
      </Card>

      {isStaff && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>MOA records</CardTitle>
            <Button asChild size="sm">
              <Link href={`/companies/${company.id}/moa/new`}>Add MOA</Link>
            </Button>
          </CardHeader>
          <CardContent>
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
                      <Badge variant="secondary">{moa.status}</Badge>
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
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
