"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";

// FR-WR-08 — Owner: AndresBonifaci0 (Matt)
// Requirement: eligibility status, a submit action, and a read-only rollup
// of the month's qualifying weekly reports.
// Connects to: eligibility from `checkMonthlyAggregationEligibility`
// (`monthlyReportService.ts`, Task 5) — the route (POST
// /api/students/[studentProfileId]/monthly-reports, Task 13) already
// enforces this gate server-side, but the UI should surface it before the
// user clicks submit, not just after a rejected POST. Submit calls that
// same POST route → `submitMonthlyReport` (Task 5). Rollup data comes from
// GET on the same route → `listMonthlyReportsForStudent` (Task 5), plus
// whatever weekly reports the eligibility check covers (fetch via
// `weeklyReportService.listWeeklyReportsForStudent`, Task 4, filtered
// client-side to the given `calendarMonth`).
// Edge cases: none beyond standard form/gate UX.
// Implementation: the server page computes eligibility and the per-month
// rollup and passes them in. A server-rendered gate needs no client
// round-trip and can't drift from what the POST route will enforce, since
// both call the same service function.

export interface MonthRollup {
  calendarMonth: string; // "YYYY-MM"
  eligible: boolean;
  submitted: { id: string; status: string } | null;
  weeklyReports: {
    id: string;
    weekStart: string;
    weekEnd: string;
    status: string;
    totalHours: number;
  }[];
}

function monthLabel(calendarMonth: string) {
  const [year, month] = calendarMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function MonthlyReportView({
  studentProfileId,
  months,
  canSubmit,
}: {
  studentProfileId: string;
  months: MonthRollup[];
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);

  async function submit(calendarMonth: string) {
    setPendingMonth(calendarMonth);
    const res = await fetch(`/api/students/${studentProfileId}/monthly-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarMonth }),
    });
    setPendingMonth(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to submit monthly report");
      return;
    }
    toast.success(`${monthLabel(calendarMonth)} monthly report submitted`);
    router.refresh();
  }

  if (months.length === 0) {
    return (
      <div
        data-testid="monthly-report-view"
        className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
      >
        <CircleDashed className="size-5" aria-hidden="true" />
        <p>No weekly reports yet — monthly reports roll up approved weekly reports.</p>
      </div>
    );
  }

  return (
    <div data-testid="monthly-report-view" className="space-y-4">
      {months.map((month) => {
        const monthHours = month.weeklyReports
          .filter((r) => r.status === "APPROVED" || r.status === "REGARDED")
          .reduce((sum, r) => sum + r.totalHours, 0);
        return (
          <div key={month.calendarMonth} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {monthLabel(month.calendarMonth)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {month.weeklyReports.length} weekly report
                  {month.weeklyReports.length === 1 ? "" : "s"} ·{" "}
                  {Math.round(monthHours * 100) / 100} approved hours
                </p>
              </div>
              {month.submitted ? (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Submitted
                  <StatusBadge status={month.submitted.status} />
                </div>
              ) : canSubmit ? (
                <Button
                  size="sm"
                  disabled={!month.eligible || pendingMonth === month.calendarMonth}
                  onClick={() => submit(month.calendarMonth)}
                  title={
                    month.eligible
                      ? undefined
                      : "Every weekly report in this month must be Approved or Regarded first"
                  }
                  className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
                >
                  <Send className="size-3.5" aria-hidden="true" />
                  {pendingMonth === month.calendarMonth ? "Submitting..." : "Submit monthly report"}
                </Button>
              ) : null}
            </div>

            {!month.submitted && !month.eligible && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Not yet eligible — every weekly report overlapping this month must be Approved or
                Regarded by your faculty adviser.
              </p>
            )}

            <ul className="divide-y rounded-md border text-sm">
              {month.weeklyReports.map((report) => (
                <li key={report.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-muted-foreground">
                    {shortDate(report.weekStart)} – {shortDate(report.weekEnd)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{report.totalHours} hrs</span>
                    <StatusBadge status={report.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
