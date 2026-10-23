import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { CalendarX } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { listSemesters } from "@/lib/services/semesterService";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateSemesterForm } from "./create-semester-form";
import { SemesterActions } from "./semester-actions";
import { WeekOneField } from "./week-one-field";
import { toDateKey } from "@/lib/utils/reportDeadline";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Semesters" };

const STAFF_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_COORDINATOR];

const dateFmt = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

export default async function SemestersPage() {
  const user = await requireUserPage();
  if (!STAFF_ROLES.includes(user.role)) redirect("/");

  const canManage = user.role === Role.SUPER_ADMIN;
  const semesters = await listSemesters();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Semesters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One semester is active at a time. Archiving keeps every record and hides the semester from
          default views.
        </p>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>New semester</CardTitle>
            <CardDescription>
              Created semesters start inactive; activate one when the term begins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateSemesterForm />
          </CardContent>
        </Card>
      )}

      {semesters.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="No semesters yet"
          description={
            canManage
              ? "Create your first semester above to start enrolling students."
              : "A Super Admin needs to create the first semester."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <caption className="sr-only">Semesters</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Academic year</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Week 1 starts</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>State</TableHead>
                {canManage && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {semesters.map((s) => {
                const archived = s.archivedAt !== null;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-foreground">{s.name}</TableCell>
                    <TableCell>{s.academicYear}</TableCell>
                    <TableCell>
                      {dateFmt.format(s.startDate)} – {dateFmt.format(s.endDate)}
                    </TableCell>
                    <TableCell>
                      {archived ? (
                        s.weekOneStart ? (
                          toDateKey(s.weekOneStart)
                        ) : (
                          "—"
                        )
                      ) : (
                        <WeekOneField
                          semesterId={s.id}
                          name={s.name}
                          value={s.weekOneStart ? toDateKey(s.weekOneStart) : ""}
                        />
                      )}
                    </TableCell>
                    <TableCell>{s._count.students}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={archived ? "ARCHIVED" : s.isActive ? "ACTIVE" : "INACTIVE"}
                      />
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {archived ? (
                          <span className="text-sm text-muted-foreground">Read-only</span>
                        ) : (
                          <SemesterActions semesterId={s.id} name={s.name} isActive={s.isActive} />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
