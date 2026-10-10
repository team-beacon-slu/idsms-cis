import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import {
  calculateRenderedHours,
  computeProjectedCompletionDate,
  getHolidayCalendarForStudent,
  getLatestScheduleChangeStatus,
  listDeviationReportsForStudent,
  type ScheduleChangeHistoryEntry,
} from "@/lib/services/attendanceService";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/workPlanService";
import { prisma } from "@/lib/prisma";
import { parseScheduleConfig } from "@/lib/utils/schedule";
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
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  Clock,
  FileWarning,
  Hourglass,
  Paperclip,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { AttendanceScheduleForm, type PendingScheduleChange } from "./schedule-form";
import { DeviationReportForm } from "./deviation-form";
import { AttendanceExportButton } from "./export-button";
import { HolidayList } from "./holiday-list";

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

  // calculateRenderedHours (not computeTotalHoursRendered) — a page view
  // shouldn't write StudentProfile.renderedHours; approvals already do.
  const [
    deviationReports,
    workPlan,
    holidays,
    renderedHours,
    projectedCompletionDate,
    studentProfile,
  ] = await Promise.all([
    listDeviationReportsForStudent(params.studentProfileId),
    getLatestApprovedWorkPlanForStudent(params.studentProfileId),
    getHolidayCalendarForStudent(params.studentProfileId),
    calculateRenderedHours(params.studentProfileId),
    computeProjectedCompletionDate(params.studentProfileId),
    prisma.studentProfile.findUnique({
      where: { id: params.studentProfileId },
      select: { requiredHours: true },
    }),
  ]);

  const isOwner = user.role === "STUDENT_INTERN";
  const requiredHours = studentProfile?.requiredHours ?? 0;
  const remainingHours = Math.max(0, requiredHours - renderedHours);
  const progressPercent =
    requiredHours > 0 ? Math.min(100, Math.round((renderedHours / requiredHours) * 100)) : 0;

  const currentSchedule = parseScheduleConfig(workPlan?.scheduleConfig);
  const changeHistory = (workPlan?.scheduleChangeHistory ?? []) as ScheduleChangeHistoryEntry[];
  const latestChangeStatus = getLatestScheduleChangeStatus(changeHistory);
  const pendingRequest =
    latestChangeStatus === "PENDING_FACULTY" || latestChangeStatus === "PENDING_COORDINATOR"
      ? [...changeHistory].reverse().find((entry) => entry.action === "REQUESTED")
      : undefined;
  const pendingChange: PendingScheduleChange | null =
    pendingRequest && latestChangeStatus
      ? {
          status: latestChangeStatus,
          requestedAt: pendingRequest.timestamp,
          reason: String(pendingRequest.reason ?? ""),
          newScheduleConfig: parseScheduleConfig(pendingRequest.newScheduleConfig) ?? {
            daysOfWeek: [],
            hoursPerDay: 0,
          },
        }
      : null;

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

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3">
              <Timer className="size-5 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm text-muted-foreground">Hours rendered</p>
                <p className="text-xl font-semibold text-foreground">
                  {renderedHours}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    / {requiredHours}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Hourglass className="size-5 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-sm text-muted-foreground">Hours remaining</p>
                <p className="text-xl font-semibold text-foreground">{remainingHours}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CalendarCheck className="size-5 text-green-600" aria-hidden="true" />
              <div>
                <p className="text-sm text-muted-foreground">Projected completion</p>
                <p className="text-xl font-semibold text-foreground">
                  {projectedCompletionDate
                    ? projectedCompletionDate.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>
          </div>
          <div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Required hours completed"
            >
              <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {progressPercent}% of required hours · only approved weekly reports count
              {!currentSchedule && " · set a schedule to see a projected completion date"}
            </p>
          </div>
        </CardContent>
      </Card>

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
          <AttendanceScheduleForm
            studentProfileId={params.studentProfileId}
            workPlanApproved={workPlan != null}
            currentSchedule={currentSchedule}
            pendingChange={pendingChange}
            canEdit={isOwner}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holidays</CardTitle>
          <CardDescription>
            Philippine holidays this semester. Uncheck one your host company works through so it
            appears on your weekly report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HolidayList
            studentProfileId={params.studentProfileId}
            holidays={holidays.map((h) => ({
              id: h.id,
              date: h.date.toISOString(),
              name: h.name,
              applicable: h.applicable,
            }))}
            canEdit={isOwner}
          />
        </CardContent>
      </Card>

      {isOwner && (
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
      )}

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
                            href={`/api/deviations/${report.id}/proof`}
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
