import Link from "next/link";
import { formatCalendarDate } from "@/lib/documents/html";
import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import {
  computeProjectedCompletionDate,
  getHoursSummary,
  getHolidayCalendarForStudent,
  getLatestScheduleChangeStatus,
  listDeviationReportsForStudent,
  type ScheduleChangeHistoryEntry,
} from "@/lib/services/attendance/attendanceService";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/predeployment/workPlanService";
import { parseScheduleConfig } from "@/lib/utils/schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
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
import { StatCard, StatStrip } from "@/components/stat-card";
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
import { AttendanceExportButton } from "./export-button";
import { HolidayList } from "./holiday-list";
import { ConductCard, type ConductCardData } from "./conduct-card";
import { listConductRecords } from "@/lib/services/conduct/conductService";
import { getDeductionMatrix, listAutomaticItems } from "@/lib/services/conduct/deductionService";
import { tallyDeductions } from "@/lib/utils/deductionMatrix";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Attendance" };

const DEVIATION_TYPE_LABEL: Record<string, string> = {
  ABSENCE: "Absence",
  OVERTIME: "Overtime",
  UNDERTIME: "Undertime",
};

export default async function AttendancePage(props: {
  params: Promise<{ studentProfileId: string }>;
}) {
  const params = await props.params;
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  // getHoursSummary is read-only (no StudentProfile.renderedHours write) —
  // a page view shouldn't persist hours; approvals already do.
  const [deviationReports, workPlan, holidays, summary, projectedCompletionDate] =
    await Promise.all([
      listDeviationReportsForStudent(params.studentProfileId),
      getLatestApprovedWorkPlanForStudent(params.studentProfileId),
      getHolidayCalendarForStudent(params.studentProfileId),
      getHoursSummary(params.studentProfileId),
      computeProjectedCompletionDate(params.studentProfileId),
    ]);

  const isOwner = user.role === "STUDENT_INTERN";
  // Workstream L2: conduct records, automatic deduction items and the tally.
  const [matrix, conductRecords, automaticItems] = await Promise.all([
    getDeductionMatrix(),
    listConductRecords(params.studentProfileId),
    listAutomaticItems(params.studentProfileId),
  ]);
  const conduct: ConductCardData = {
    tally: tallyDeductions(
      matrix,
      conductRecords.filter((r) => !r.revokedAt),
      automaticItems.filter((i) => !i.excused)
    ),
    records: conductRecords.map((r) => ({
      id: r.id,
      categoryKey: r.categoryKey,
      weight: r.weight,
      date: r.date.toISOString(),
      reason: r.reason,
      hoursDeducted: Number(r.hoursDeducted),
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokeReason: r.revokeReason,
    })),
    items: automaticItems.map((i) => ({ ...i, date: i.date.toISOString() })),
    categories: matrix
      .filter((c) => c.source === "MANUAL")
      .map(({ key, label }) => ({ key, label })),
  };
  const renderedHours = summary.confirmedHours;
  const requiredHours = summary.requiredHours;
  const remainingHours = summary.remainingHours;
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
      <PageHeader
        title="Attendance"
        description="Hours, the deployment schedule, holidays, leave and conduct for this internship."
      />

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
                {summary.pendingHours > 0 && (
                  <p className="text-xs text-amber-700">
                    +{summary.pendingHours} hrs pending faculty review
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Hourglass className="size-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm text-muted-foreground">Hours remaining</p>
                <p className="text-xl font-semibold text-foreground">{remainingHours}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CalendarCheck className="size-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm text-muted-foreground">Projected completion</p>
                <p className="text-xl font-semibold text-foreground">
                  {projectedCompletionDate
                    ? projectedCompletionDate.toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "Asia/Manila",
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
              {progressPercent}% confirmed · pending hours count only after faculty approval
              {summary.pendingHours > 0 &&
                ` · ${summary.remainingIfPendingApproved} hrs left if pending reports are approved`}
              {!currentSchedule && " · set a schedule to see a projected completion date"}
            </p>
          </div>
        </CardContent>
      </Card>

      <StatStrip>
        <StatCard
          label="Pending review"
          value={pendingCount}
          icon={Clock}

          hint="Awaiting faculty validation"
        />
        <StatCard
          label="Validated"
          value={validatedCount}
          icon={ShieldCheck}

          hint="Counted toward hours"
        />
        <StatCard
          label="Rejected"
          value={rejectedCount}
          icon={FileWarning}

          hint="Excluded from hours"
        />
      </StatStrip>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Deployment schedule</CardTitle>
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
            review={
              workPlan &&
              pendingChange?.status === "PENDING_FACULTY" &&
              user.role === "FACULTY_ADVISER"
                ? { workPlanId: workPlan.id, stage: "faculty" }
                : workPlan &&
                    pendingChange?.status === "PENDING_COORDINATOR" &&
                    (user.role === "DEPARTMENT_COORDINATOR" || user.role === "SUPER_ADMIN")
                  ? { workPlanId: workPlan.id, stage: "coordinator" }
                  : null
            }
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Leave &amp; Time Requests
                <Badge variant="secondary" className="font-normal">
                  {deviationReports.length}
                </Badge>
              </CardTitle>
              <CardDescription>
                Leave, overtime and undertime on file. File and review them in the Leave &amp; Time
                Requests tab.
              </CardDescription>
            </div>
            <Link
              href={`/students/${params.studentProfileId}/leave-requests`}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-primary transition-colors duration-200 hover:bg-accent"
            >
              <CalendarClock className="size-3.5" aria-hidden="true" />
              Open Leave &amp; Time Requests
            </Link>
          </div>
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
                        {formatCalendarDate(new Date(report.date))}
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
      <Card>
        <CardHeader>
          <CardTitle>Conduct &amp; deductions</CardTitle>
          <CardDescription>
            Warnings, demerits and violations on record, items counted automatically, and the
            resulting grade-point deductions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConductCard
            studentProfileId={params.studentProfileId}
            isStaff={!isOwner}
            data={conduct}
          />
        </CardContent>
      </Card>
    </div>
  );
}
