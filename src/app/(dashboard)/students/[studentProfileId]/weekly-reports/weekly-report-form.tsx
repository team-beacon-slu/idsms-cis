"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Eye, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getWeeklyReportDueDate, isWeeklyReportLate } from "@/lib/utils/reportDeadline";
import { isAttendanceStatus, minutesBetween, type AttendanceStatus } from "@/lib/validators/report";
import { autoHoursFromTimes } from "./auto-hours";
import { detectCopyPasteWarning } from "./copy-paste-warning";
import { generatePdfInBackground } from "./report-pdf-actions";

// FR-WR-02, FR-WR-03 — Owner: gu457 (Ulrich)
// Requirement: daily accomplishment entry UI — one row per scheduled day
// (hours + accomplishments + tools used), showing live running totals.
// Connects to: PATCH /api/weekly-reports/[id] (Task 12 route) →
// `weeklyReportService.saveDailyAccomplishment` (Task 4), which the route
// already chains with `calculateWeeklyTotalHours`/
// `calculateRunningTotalAndRemaining` and returns in one response — this
// component just needs to read `{ entry, totalHours, runningTotal,
// remainingHours }` from that response and re-render. Before submit, call
// `detectCopyPasteWarning` from `./copy-paste-warning.ts` (F7, same task)
// to block submission on a near-duplicate accomplishment entry.
// Edge cases: none beyond standard form validation.
// Implementation notes: edits are batched — "Save draft" PATCHes every
// changed day in order, and "Submit" saves first, then POSTs
// /api/weekly-reports/[id]/submit. Copy-paste checks compare each day
// against the student's previous week and against the other days of this
// week. Both cases block submission.

export interface DailyEntryRow {
  id: string;
  reportDate: string; // ISO, UTC-midnight calendar date
  scheduledHours: number;
  actualHours: number | null;
  accomplishments: string | null;
  toolsUsed: string | null;
  attendanceStatus: string; // PRESENT | ABSENT | HOLIDAY | SCHEDULED (unfilled)
  timeIn: string | null; // "HH:MM"
  timeOut: string | null;
}

export interface WeeklyTotals {
  totalHours: number;
  runningTotal: number;
  remainingHours: number;
}

interface RowState {
  status: AttendanceStatus;
  hours: string;
  timeIn: string;
  timeOut: string;
  accomplishments: string;
  toolsUsed: string;
  dirty: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
  SCHEDULED: "Not filled",
};

// Pre-fills hours from the time pair (see auto-hours.ts); the student can
// still edit hours down.
function withAutoHours(row: RowState): Partial<RowState> {
  const hours = autoHoursFromTimes(row.timeIn, row.timeOut);
  return hours === null
    ? { timeIn: row.timeIn, timeOut: row.timeOut }
    : { timeIn: row.timeIn, timeOut: row.timeOut, hours: String(hours) };
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function TotalsBar({ totals }: { totals: WeeklyTotals }) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
      <div>
        <p className="text-xs text-muted-foreground">This week</p>
        <p className="text-lg font-semibold text-foreground">{totals.totalHours} hrs</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Running total</p>
        <p className="text-lg font-semibold text-foreground">{totals.runningTotal} hrs</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Remaining</p>
        <p className="text-lg font-semibold text-foreground">{totals.remainingHours} hrs</p>
      </div>
    </div>
  );
}

export function WeeklyReportForm({
  weeklyReportId,
  entries,
  totals: initialTotals,
  editable,
  weekEnd,
  priorAccomplishments,
}: {
  weeklyReportId: string;
  entries: DailyEntryRow[];
  totals: WeeklyTotals;
  editable: boolean;
  weekEnd: string;
  priorAccomplishments: string[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      entries.map((e) => [
        e.id,
        {
          // An unfilled (SCHEDULED) day starts as Present.
          status: isAttendanceStatus(e.attendanceStatus) ? e.attendanceStatus : "PRESENT",
          hours: e.actualHours == null ? "" : String(e.actualHours),
          timeIn: e.timeIn ?? "",
          timeOut: e.timeOut ?? "",
          accomplishments: e.accomplishments ?? "",
          toolsUsed: e.toolsUsed ?? "",
          dirty: false,
        },
      ])
    )
  );
  const [totals, setTotals] = useState(initialTotals);
  const [reasonForDelay, setReasonForDelay] = useState("");
  const [isPending, setIsPending] = useState(false);

  const weekEndDate = useMemo(() => new Date(weekEnd), [weekEnd]);
  const late = isWeeklyReportLate(weekEndDate);
  const dueDate = getWeeklyReportDueDate(weekEndDate);

  // Entry id → why it was flagged. Previous-week matches take precedence.
  const copyPasteFlags = useMemo(() => {
    const flags: Record<string, string> = {};
    const textOf = (id: string) =>
      rows[id]?.status === "PRESENT" ? (rows[id]?.accomplishments ?? "") : "";
    entries.forEach((entry, index) => {
      if (rows[entry.id]?.status !== "PRESENT") return;
      const text = textOf(entry.id);
      if (priorAccomplishments.some((prior) => detectCopyPasteWarning(text, prior))) {
        flags[entry.id] = "Nearly identical to an entry from your previous week";
        return;
      }
      const earlier = entries
        .slice(0, index)
        .find((other) => detectCopyPasteWarning(text, textOf(other.id)));
      if (earlier) {
        flags[entry.id] = `Nearly identical to ${formatDay(earlier.reportDate)}`;
      }
    });
    return flags;
  }, [entries, rows, priorAccomplishments]);

  const hasCopyPaste = Object.keys(copyPasteFlags).length > 0;
  const hasDirty = Object.values(rows).some((r) => r.dirty);

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, dirty: true } }));
  }

  function rowProblem(entry: DailyEntryRow): string | null {
    const row = rows[entry.id];
    // Absent and holiday days count 0 hours and need no description.
    if (row.status !== "PRESENT") return null;
    const hours = Number(row.hours);
    if (row.hours === "" || Number.isNaN(hours)) return "Enter hours worked";
    if (hours < 0 || hours > 24) return "Hours must be between 0 and 24";
    if (row.timeIn && row.timeOut) {
      const window = minutesBetween(row.timeIn, row.timeOut);
      if (window <= 0) return "Time out must be after time in";
      if (hours * 60 > window + 0.5) return "Hours can't exceed the time between time in and out";
    }
    if (!row.accomplishments.trim()) return "Describe what you accomplished";
    return null;
  }

  // Saves every changed day. Returns false (after a toast) if any failed.
  async function saveDirtyRows(): Promise<boolean> {
    for (const entry of entries) {
      const row = rows[entry.id];
      if (!row.dirty) continue;
      const problem = rowProblem(entry);
      if (problem) {
        toast.error(`${formatDay(entry.reportDate)}: ${problem}`);
        return false;
      }
      const res = await fetch(`/api/weekly-reports/${weeklyReportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyReportEntryId: entry.id,
          hours: row.status === "PRESENT" ? Number(row.hours) : 0,
          accomplishments: row.status === "PRESENT" ? row.accomplishments.trim() : "",
          toolsUsed: (row.status === "PRESENT" && row.toolsUsed.trim()) || undefined,
          attendanceStatus: row.status,
          timeIn: (row.status === "PRESENT" && row.timeIn) || undefined,
          timeOut: (row.status === "PRESENT" && row.timeOut) || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Failed to save ${formatDay(entry.reportDate)}`);
        return false;
      }
      const body = await res.json();
      setTotals({
        totalHours: body.totalHours,
        runningTotal: body.runningTotal,
        remainingHours: body.remainingHours,
      });
      setRows((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], dirty: false } }));
    }
    return true;
  }

  async function onSaveDraft() {
    setIsPending(true);
    const ok = await saveDirtyRows();
    setIsPending(false);
    if (ok) {
      toast.success("Draft saved");
      router.refresh();
    }
  }

  async function onPreview() {
    const res = await fetch(`/api/weekly-reports/${weeklyReportId}/preview`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.previewUrl) {
      toast.error(body.error ?? "Preview unavailable");
      return;
    }
    window.open(body.previewUrl, "_blank", "noopener,noreferrer");
  }

  async function onSubmit() {
    if (hasCopyPaste) {
      toast.error("Rewrite the flagged entries — copied accomplishments can't be submitted");
      return;
    }
    const incomplete = entries.find((entry) => rowProblem(entry));
    if (incomplete) {
      toast.error(`${formatDay(incomplete.reportDate)}: ${rowProblem(incomplete)}`);
      return;
    }
    if (late && !reasonForDelay.trim()) {
      toast.error("This report is late — add a reason for delay before submitting");
      return;
    }

    setIsPending(true);
    const saved = await saveDirtyRows();
    if (!saved) {
      setIsPending(false);
      return;
    }
    const res = await fetch(`/api/weekly-reports/${weeklyReportId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(late ? { reasonForDelay: reasonForDelay.trim() } : {}),
    });
    setIsPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to submit report");
      return;
    }
    const body = await res.json();
    toast.success(`Report submitted · reference ${body.referenceCode}`);
    router.refresh();
    // Module 8: render the PDF (for supervisor signing) in the background. Failures are
    // recorded server-side as FAILED and offered as "Regenerate PDF".
    void generatePdfInBackground(`/api/weekly-reports/${weeklyReportId}/pdf`, () =>
      router.refresh()
    );
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No scheduled working days fall in this week.
      </p>
    );
  }

  if (!editable) {
    return (
      <div data-testid="weekly-report-form" className="space-y-3">
        <TotalsBar totals={totals} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Day</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Hours</th>
                <th className="py-2 pr-3 font-medium">Accomplishments</th>
                <th className="py-2 font-medium">Tools used</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                    {formatDay(entry.reportDate)}
                  </td>
                  <td className="py-2 pr-3">
                    {STATUS_LABEL[entry.attendanceStatus] ?? entry.attendanceStatus}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
                    {entry.timeIn && entry.timeOut ? `${entry.timeIn}–${entry.timeOut}` : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {entry.actualHours ?? "—"}
                    <span className="text-xs text-muted-foreground"> / {entry.scheduledHours}</span>
                  </td>
                  <td className="whitespace-pre-wrap py-2 pr-3">{entry.accomplishments ?? "—"}</td>
                  <td className="py-2 text-muted-foreground">{entry.toolsUsed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="weekly-report-form" className="space-y-4">
      <TotalsBar totals={totals} />

      <div className="space-y-3">
        {entries.map((entry) => {
          const row = rows[entry.id];
          const flag = copyPasteFlags[entry.id];
          return (
            <div
              key={entry.id}
              className={cn(
                "grid gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_10rem_1fr]",
                flag &&
                  "border-amber-300 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/5"
              )}
            >
              <div>
                <p className="text-sm font-medium text-foreground">{formatDay(entry.reportDate)}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.scheduledHours} hrs scheduled
                </p>
                {row.dirty && <p className="mt-1 text-xs text-amber-600">Unsaved</p>}
              </div>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor={`status-${entry.id}`} className="text-xs">
                    Status
                  </Label>
                  <select
                    id={`status-${entry.id}`}
                    value={row.status}
                    disabled={isPending}
                    onChange={(e) => {
                      const status = e.target.value;
                      if (!isAttendanceStatus(status)) return;
                      updateRow(
                        entry.id,
                        status === "PRESENT"
                          ? { status }
                          : { status, hours: "0", timeIn: "", timeOut: "", toolsUsed: "" }
                      );
                    }}
                    className="flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm disabled:cursor-not-allowed"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="HOLIDAY">Holiday</option>
                  </select>
                </div>
                {row.status === "PRESENT" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`in-${entry.id}`} className="text-xs">
                          Time in
                        </Label>
                        <Input
                          id={`in-${entry.id}`}
                          type="time"
                          value={row.timeIn}
                          disabled={isPending}
                          onChange={(e) =>
                            updateRow(entry.id, withAutoHours({ ...row, timeIn: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`out-${entry.id}`} className="text-xs">
                          Time out
                        </Label>
                        <Input
                          id={`out-${entry.id}`}
                          type="time"
                          value={row.timeOut}
                          disabled={isPending}
                          onChange={(e) =>
                            updateRow(entry.id, withAutoHours({ ...row, timeOut: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`hours-${entry.id}`} className="text-xs">
                        Hours
                      </Label>
                      <Input
                        id={`hours-${entry.id}`}
                        type="number"
                        min={0}
                        max={24}
                        step={0.25}
                        value={row.hours}
                        disabled={isPending}
                        onChange={(e) => updateRow(entry.id, { hours: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2">
                {row.status === "PRESENT" ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor={`acc-${entry.id}`} className="text-xs">
                        Accomplishments
                      </Label>
                      <Textarea
                        id={`acc-${entry.id}`}
                        rows={2}
                        value={row.accomplishments}
                        disabled={isPending}
                        onChange={(e) => updateRow(entry.id, { accomplishments: e.target.value })}
                        placeholder="What did you work on and finish today?"
                      />
                    </div>
                    <Input
                      aria-label={`Tools used on ${formatDay(entry.reportDate)}`}
                      value={row.toolsUsed}
                      disabled={isPending}
                      onChange={(e) => updateRow(entry.id, { toolsUsed: e.target.value })}
                      placeholder="Tools used (optional) — e.g. VS Code, Figma"
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {row.status === "HOLIDAY" ? "Holiday" : "Absent"} — counts 0 hours; no
                    accomplishments needed.
                  </p>
                )}
                {flag && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    {flag} — please describe this day&apos;s work in your own words.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {late && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/10">
          <Label htmlFor={`delay-${weeklyReportId}`} className="text-red-700 dark:text-red-400">
            Reason for delay (required — due{" "}
            {dueDate.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
            )
          </Label>
          <Textarea
            id={`delay-${weeklyReportId}`}
            rows={2}
            value={reasonForDelay}
            disabled={isPending}
            onChange={(e) => setReasonForDelay(e.target.value)}
            placeholder="Your faculty adviser will see this note"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={onSaveDraft}
          disabled={isPending || !hasDirty}
          className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
        >
          <Save className="size-3.5" aria-hidden="true" />
          {isPending ? "Saving..." : "Save draft"}
        </Button>
        <Button
          variant="outline"
          onClick={onPreview}
          disabled={isPending}
          className="cursor-pointer gap-1.5"
        >
          <Eye className="size-3.5" aria-hidden="true" />
          Preview
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isPending || hasCopyPaste}
          title={hasCopyPaste ? "Rewrite the flagged entries first" : undefined}
          className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
        >
          <Send className="size-3.5" aria-hidden="true" />
          {isPending ? "Submitting..." : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
