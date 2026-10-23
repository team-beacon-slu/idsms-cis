import { redirect } from "next/navigation";
import { CalendarX2 } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/accounts/userService";
import { listTimeRequests } from "@/lib/services/attendance/timeRequestService";
import { toDateKey } from "@/lib/utils/reportDeadline";
import { formatHrsMins } from "@/lib/utils/timeMath";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EditRequestButton, RequestForm, type RequestFormValues } from "./request-form";
import { RequestReviewActions } from "./request-review-actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Leave & time requests" };

// Workstream L1 — "Leave & Time Requests" tab. The intern files and edits
// requests; the assigned adviser, coordinator or Super Admin reviews them.

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
const PREFILL_KEYS = ["deviationType", "date", "startTime", "endTime"] as const;

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
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
  // Prefill from the weekly report's "file an undertime request" link.
  const prefill: Partial<RequestFormValues> = {};
  for (const key of PREFILL_KEYS) {
    const value = searchParams[key];
    if (typeof value === "string") prefill[key] = value;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave & time requests"
        description="Leave, overtime and undertime, reviewed by the faculty adviser. Approved overtime is credited to rendered hours."
      />

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>New request</CardTitle>
            <CardDescription>
              File overtime before you work it. File undertime for any late arrival or early leave.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestForm studentProfileId={params.studentProfileId} initial={prefill} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Requests
            <Badge variant="secondary" className="font-normal">
              {requests.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <CalendarX2 className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No requests have been filed yet.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => {
                const type = TYPE_LABEL[r.deviationType] ?? r.deviationType;
                const label = `${type} on ${fmtDate(r.date)}`;
                const status = STATUS[r.validationStatus] ?? STATUS.PENDING;
                const editable = r.validationStatus !== "VALIDATED";
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
                      {r.validationStatus === "REJECTED" && r.reviewNote && (
                        <p className="text-sm text-red-700">Adviser&apos;s note: {r.reviewNote}</p>
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
                    {!isOwner && r.validationStatus !== "REJECTED" && (
                      <RequestReviewActions
                        requestId={r.id}
                        label={label}
                        canApprove={r.validationStatus === "PENDING"}
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
