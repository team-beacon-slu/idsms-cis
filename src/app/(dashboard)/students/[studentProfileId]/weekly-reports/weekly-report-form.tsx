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
import { detectCopyPasteWarning } from "./copy-paste-warning";

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
}

export interface WeeklyTotals {
  totalHours: number;
  runningTotal: number;
  remainingHours: number;
}

interface RowState {
  hours: string;
  accomplishments: string;
  toolsUsed: string;
  dirty: boolean;
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
          hours: e.actualHours == null ? "" : String(e.actualHours),
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
    entries.forEach((entry, index) => {
      const text = rows[entry.id]?.accomplishments ?? "";
      if (priorAccomplishments.some((prior) => detectCopyPasteWarning(text, prior))) {
        flags[entry.id] = "Nearly identical to an entry from your previous week";
        return;
      }
      const earlier = entries
        .slice(0, index)
        .find((other) => detectCopyPasteWarning(text, rows[other.id]?.accomplishments ?? ""));
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
    const hours = Number(row.hours);
    if (row.hours === "" || Number.isNaN(hours)) return "Enter hours worked (0 if absent)";
    if (hours < 0 || hours > 24) return "Hours must be between 0 and 24";
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
          hours: Number(row.hours),
          accomplishments: row.accomplishments.trim(),
          toolsUsed: row.toolsUsed.trim() || undefined,
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
    // Module 8: render the signed-copy PDF in the background. Failures are
    // recorded server-side as FAILED and offered as "Regenerate PDF".
    void fetch(`/api/weekly-reports/${weeklyReportId}/pdf`, { method: "POST" }).finally(() =>
      router.refresh()
    );
    router.refresh();
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
                "grid gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_6rem_1fr]",
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
              <div className="space-y-2">
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
