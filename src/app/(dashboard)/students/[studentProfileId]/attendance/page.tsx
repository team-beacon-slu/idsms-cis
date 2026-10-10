import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listDeviationReportsForStudent } from "@/lib/services/attendanceService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import {
  CalendarClock,
  CalendarX2,
  Clock,
  FileWarning,
  Paperclip,
  ShieldCheck,
} from "lucide-react";
import { AttendanceScheduleForm } from "./schedule-form";
import { DeviationReportForm } from "./deviation-form";
import { AttendanceExportButton } from "./export-button";

const DEVIATION_TYPE_LABEL: Record<string, string> = {
  ABSENCE: "Absence",
  OVERTIME: "Overtime",
  UNDERTIME: "Undertime",
};

export default async function AttendancePage({ params }: { params: { studentProfileId: string } }) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const deviationReports = await listDeviationReportsForStudent(params.studentProfileId);

  const pendingCount = deviationReports.filter((r) => r.validationStatus === "PENDING").length;
  const validatedCount = deviationReports.filter((r) => r.validationStatus === "VALIDATED").length;
  const rejectedCount = deviationReports.filter((r) => r.validationStatus === "REJECTED").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <CalendarClock className="size-5 text-primary" aria-hidden="true" />
          Attendance &amp; Schedule
        </h1>
        <p className="text-sm text-muted-foreground">
          Deployment schedule, hour tracking, and deviation reports for this internship.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending review"
          value={pendingCount}
          icon={Clock}
          tone="amber"
          hint="Awaiting faculty validation"
        />
        <StatCard
          label="Validated"
          value={validatedCount}
          icon={ShieldCheck}
          tone="green"
          hint="Counted toward hours"
        />
        <StatCard
          label="Rejected"
          value={rejectedCount}
          icon={FileWarning}
          tone="red"
          hint="Excluded from hours"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Deployment Schedule</CardTitle>
              <CardDescription>
                Configure or request a change to the weekly schedule.
              </CardDescription>
            </div>
            <AttendanceExportButton studentProfileId={params.studentProfileId} />
          </div>
        </CardHeader>
        <CardContent>
          <AttendanceScheduleForm studentProfileId={params.studentProfileId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report a Deviation</CardTitle>
          <CardDescription>
            Log an absence, overtime, or undertime for faculty validation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeviationReportForm studentProfileId={params.studentProfileId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Deviation History
            <Badge variant="secondary" className="font-normal">
              {deviationReports.length}
            </Badge>
          </CardTitle>
          <CardDescription>All absence, overtime, and undertime reports on file.</CardDescription>
        </CardHeader>
        <CardContent>
          {deviationReports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <CalendarX2 className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                No deviation reports have been filed yet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">Deviation report history</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Proof</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviationReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(report.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {DEVIATION_TYPE_LABEL[report.deviationType] ?? report.deviationType}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-xs truncate text-foreground"
                        title={report.reason}
                      >
                        {report.reason}
                      </TableCell>
                      <TableCell>
                        {report.proofUrl ? (
                          <a
                            href={report.proofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex cursor-pointer items-center gap-1 text-sm text-primary transition-colors duration-200 hover:underline"
                          >
                            <Paperclip className="size-3.5" aria-hidden="true" />
                            View
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={report.validationStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
