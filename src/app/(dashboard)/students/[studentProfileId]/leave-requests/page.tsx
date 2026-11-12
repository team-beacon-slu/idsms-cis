import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarX2, ClipboardCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { adviserNoteOf, isReported } from "@/lib/services/attendance/reportedTimeRecords";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { listTimeRequests } from "@/lib/services/attendance/timeRequestService";
import { toDateKey } from "@/lib/utils/reportDeadline";
import { formatHrsMins } from "@/lib/utils/timeMath";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { TimeReportLinks } from "../weekly-reports/time-report-links";
import { safeInternalPath } from "@/lib/utils/safeInternalPath";
import { EditRequestButton, type RequestFormValues } from "./request-form";
import { RequestReviewActions } from "./request-review-actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overtime, undertime & absences" };

// Overtime, undertime and absences on record. Since Nov 2026 (adviser feedback) the intern
// reports them on the day in the weekly report, and the adviser's say is the week's review;
// requests filed the old way stay listed, editable and reviewable here until they are done.

const TYPE_LABEL: Record<string, string> = {
  ABSENCE: "Leave",
  OVERTIME: "Overtime",
  UNDERTIME: "Undertime",
};
const KIND_LABEL: Record<string, string> = { ANTICIPATED: "Anticipated", EMERGENCY: "Emergency" };
const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "border-amber-300 text-amber-800" },
  VALIDATED: {
    label: "Approved",
    className: "border-green-300 text-green-800",
  },
  REJECTED: { label: "Returned", className: "border-red-300 text-red-800" },
};

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export default async function LeaveRequestsPage(props: {
  params: Promise<{ studentProfileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await requireUserPage();
  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    throw error;
  }

  const requests = await listTimeRequests(params.studentProfileId);
  const isOwner = user.role === "STUDENT_INTERN";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overtime, undertime & absences"
        description="Every overtime, early leave and absence on record, with its reason."
      />

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Report it on the day, in your weekly report</CardTitle>
            <CardDescription>
              Worked late, left early or were absent? Open that day in your weekly report: it
              notices the change from your times and asks for the reason there. Leave itself is
              approved by your company supervisor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={
                safeInternalPath(searchParams.returnTo) ??
                `/students/${params.studentProfileId}/weekly-reports`
              }
              className={cn(buttonVariants(), "gap-1.5")}
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Open my weekly report
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Reports for your terminal requirements</CardTitle>
          <CardDescription>
            SLU&apos;s reports on off-duty (overtime) hours, under time and absences for the whole
            internship, from the records below. Have your supervisor sign them; each week&apos;s own
            reports are on the Weekly reports page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <TimeReportLinks
            studentProfileId={params.studentProfileId}
            kinds={["OT", "UT", "ABSENCE"]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            On record
            <Badge variant="secondary" className="font-normal">
              {requests.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <CalendarX2 className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                No overtime, undertime or absences yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => {
                const type = TYPE_LABEL[r.deviationType] ?? r.deviationType;
                const label = `${type} on ${fmtDate(r.date)}`;
                // Reported in a weekly report: edited on that day; the adviser accepts it or not.
                const reported = isReported(r.reviewNote);
                const base = STATUS[r.validationStatus] ?? STATUS.PENDING;
                const status = reported
                  ? {
                      label:
                        r.validationStatus === "PENDING"
                          ? "Reported · waiting for adviser"
                          : r.validationStatus === "VALIDATED"
                            ? "Reported · accepted"
                            : "Reported · not accepted",
                      className: base.className,
                    }
                  : base;
                const note = adviserNoteOf(r.reviewNote);
                const editable = !reported && r.validationStatus !== "VALIDATED";
                const initial: RequestFormValues = {
                  deviationType: r.deviationType,
                  requestKind: r.requestKind ?? "ANTICIPATED",
                  date: toDateKey(r.date),
                  endDate: r.endDate ? toDateKey(r.endDate) : "",
                  startTime: r.startTime ?? "",
                  endTime: r.endTime ?? "",
                  reason: r.reason,
                  proofType: r.proofType ?? "",
                };
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        {type}
                        {r.requestKind && (
                          <span className="text-xs font-normal text-muted-foreground">
                            {KIND_LABEL[r.requestKind]}
                          </span>
                        )}
                        <Badge variant="outline" className={status.className}>
                          {status.label}
                        </Badge>
                        {r.filedAfterTheFact && (
                          <Badge variant="outline" className="border-red-300 text-red-800">
                            Filed after the fact
                          </Badge>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {fmtDate(r.date)}
                        {r.endDate && ` – ${fmtDate(r.endDate)}`}
                        {r.startTime && r.endTime && ` · ${r.startTime}–${r.endTime}`}
                        {r.requestedMinutes != null &&
                          ` · ${formatHrsMins(r.requestedMinutes / 60)}`}
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{r.reason}</p>
                      {r.validationStatus === "REJECTED" && note && (
                        <p className="text-sm text-red-700">Adviser&apos;s note: {note}</p>
                      )}
                    </div>
                    {isOwner && editable && (
                      <EditRequestButton
                        studentProfileId={params.studentProfileId}
                        requestId={r.id}
                        initial={initial}
                        label={label}
                      />
                    )}
                    {!isOwner && (reported || r.validationStatus !== "REJECTED") && (
                      <RequestReviewActions
                        requestId={r.id}
                        label={label}
                        canApprove={
                          r.validationStatus === "PENDING" ||
                          (reported && r.validationStatus === "REJECTED")
                        }
                        canReturn={r.validationStatus !== "REJECTED"}
                        wording={reported ? "reason" : "request"}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
