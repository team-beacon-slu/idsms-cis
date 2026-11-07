"use client";

import { useEffect, useMemo, useState } from "react";
import { ClarityCoach } from "@/components/ai/clarity-coach";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarPlus, Eye, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getWeeklyReportDueDate, isWeeklyReportLate } from "@/lib/utils/reportDeadline";
import {
  dailyEntrySchema,
  isAttendanceStatus,
  rangeMinutes,
  type AttendanceStatus,
} from "@/lib/validators/report";
import { addDays, toDateKey } from "@/lib/utils/reportDeadline";
import { dayGaps, formatHrsMins, timeOfDay, toHHMM, type Shift } from "@/lib/utils/timeMath";
import { sendJson } from "@/lib/utils/sendJson";
import { clearDraft, loadDraft, saveDraft } from "@/lib/utils/reportDraft";
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
  timeIn2: string | null; // optional afternoon range
  timeOut2: string | null;
}

// A day's clock times; the intern's usual ones prefill days the schedule gives no times for.
export interface DayTimes {
  timeIn: string;
  timeOut: string;
  timeIn2: string;
  timeOut2: string;
}

export interface WeeklyTotals {
  totalHours: number;
  runningTotal: number; // hours worked, before deductions
  conductDeductions: number;
  remainingHours: number; // after deductions
}

interface RowState {
  status: AttendanceStatus;
  hours: string;
  timeIn: string;
  timeOut: string;
  timeIn2: string;
  timeOut2: string;
  accomplishments: string;
  toolsUsed: string;
  dirty: boolean;
  // Copying the times typed on an earlier day of this week (until the intern edits this day).
  follows?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
  SCHEDULED: "Not filled",
};

// Pre-fills hours with the time worked across both ranges (the shared
// rangeMinutes the validator uses); the student can still edit hours down.
// Credited hours under SLU's rules are computed server-side.
function withAutoHours(row: RowState): Partial<RowState> {
  const times = {
    timeIn: row.timeIn,
    timeOut: row.timeOut,
    timeIn2: row.timeIn2,
    timeOut2: row.timeOut2,
  };
  const minutes = row.timeIn && row.timeOut ? rangeMinutes(times) : 0;
  return minutes > 0 ? { ...times, hours: String(Math.round((minutes / 60) * 100) / 100) } : times;
}

// The PATCH body for one row; also what rowProblem validates.
function rowPayload(entryId: string, row: RowState) {
  const present = row.status === "PRESENT";
  return {
    dailyReportEntryId: entryId,
    hours: present ? Number(row.hours) : 0,
    accomplishments: present ? row.accomplishments.trim() : "",
    toolsUsed: (present && row.toolsUsed.trim()) || undefined,
    attendanceStatus: row.status,
    timeIn: (present && row.timeIn) || undefined,
    timeOut: (present && row.timeOut) || undefined,
    timeIn2: (present && row.timeIn2) || undefined,
    timeOut2: (present && row.timeOut2) || undefined,
  };
}

// A day that can't be submitted: the message and which input (by id prefix) to fix.
type DayProblem = { message: string; field: string };

// dailyEntrySchema paths -> the id prefix of the input that holds them.
const FIELD_IDS: Record<string, string> = {
  hours: "hours",
  accomplishments: "acc",
  toolsUsed: "tools",
  timeIn: "in",
  timeOut: "out",
  timeIn2: "in2",
  timeOut2: "out2",
};

function focusField(entryId: string, field: string) {
  const el =
    document.getElementById(`${field}-${entryId}`) ?? document.getElementById(`day-${entryId}`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.focus({ preventScroll: true });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function TotalsBar({ totals }: { totals: WeeklyTotals }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-center sm:grid-cols-4">
      <div>
        <p className="text-xs text-muted-foreground">This week</p>
        <p className="text-lg font-semibold text-foreground">{formatHrsMins(totals.totalHours)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Running total (worked)</p>
        <p className="text-lg font-semibold text-foreground">
          {formatHrsMins(totals.runningTotal)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Conduct deductions</p>
        <p
          className={`text-lg font-semibold ${totals.conductDeductions > 0 ? "text-destructive" : "text-foreground"}`}
        >
          {totals.conductDeductions > 0 ? "−" : ""}
          {formatHrsMins(totals.conductDeductions)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Remaining</p>
        <p className="text-lg font-semibold text-foreground">
          {formatHrsMins(totals.remainingHours)}
        </p>
      </div>
    </div>
  );
}

// Adds a non-scheduled day (e.g. a Saturday worked under an approved OT
// request). Disabled while there are unsaved edits, since adding refreshes.
function AddDayControl({
  weeklyReportId,
  weekEnd,
  takenDates,
  disabled,
  onAdded,
}: {
  weeklyReportId: string;
  weekEnd: Date;
  takenDates: string[];
  disabled: boolean;
  onAdded: () => void;
}) {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const min = toDateKey(addDays(weekEnd, -6));
  const max = toDateKey(weekEnd);

  async function add() {
    if (!date) return;
    if (takenDates.includes(date)) {
      toast.error("That day is already in this report");
      return;
    }
    setBusy(true);
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/entries`, {
      method: "POST",
      body: { reportDate: date },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDate("");
    toast.success("Day added — fill in its times and accomplishments");
    onAdded();
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-4">
      <Label htmlFor={`add-day-${weeklyReportId}`} className="text-xs">
        Overtime: add a day you worked outside your schedule
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`add-day-${weeklyReportId}`}
          type="date"
          min={min}
          max={max}
          value={date}
          disabled={disabled || busy}
          onChange={(e) => setDate(e.target.value)}
          className="w-44"
        />
        <Button
          type="button"
          variant="outline"
          onClick={add}
          disabled={disabled || busy || !date}
          className="h-9 cursor-pointer gap-1.5 disabled:cursor-not-allowed"
        >
          <CalendarPlus className="size-3.5" aria-hidden="true" />
          {busy ? "Adding..." : "Add a day"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Only credited with an approved overtime request.
      </p>
    </div>
  );
}

function rowFromEntry(
  e: DailyEntryRow,
  shift: Shift | null = null,
  usual: DayTimes | null = null,
  usualTools = ""
): RowState {
  // An unfilled scheduled day starts as Present at the schedule's times, else at the times
  // of the intern's last worked day (the adviser: fewer things to type); the intern changes
  // them if the day was different.
  const unfilled = e.scheduledHours > 0 && e.actualHours == null && !e.timeIn;
  const base: RowState = {
    // An unfilled (SCHEDULED) day starts as Present.
    status: isAttendanceStatus(e.attendanceStatus) ? e.attendanceStatus : "PRESENT",
    hours: e.actualHours == null ? "" : String(e.actualHours),
    timeIn: e.timeIn ?? "",
    timeOut: e.timeOut ?? "",
    timeIn2: e.timeIn2 ?? "",
    timeOut2: e.timeOut2 ?? "",
    accomplishments: e.accomplishments ?? "",
    toolsUsed: e.toolsUsed ?? "",
    dirty: false,
  };
  if (!unfilled || base.status !== "PRESENT") return base;
  // Tools rarely change day to day: start from the last worked day's, like the times.
  base.toolsUsed ||= usualTools;
  if (shift) {
    return {
      ...base,
      hours: String(shift.scheduledHours),
      timeIn: toHHMM(shift.startMin),
      timeOut: toHHMM(shift.endMin),
      dirty: true, // so Save sends the defaulted times
    };
  }
  if (usual) return { ...base, ...withAutoHours({ ...base, ...usual }), dirty: true };
  return base;
}

// A later day follows the times just typed while the intern hasn't touched it: still as
// loaded (blank or prefilled), Present, and nothing written yet.
function followsTypedTimes(row: RowState | undefined, loaded: RowState | undefined) {
  if (!row || !loaded || row.status !== "PRESENT" || row.accomplishments.trim()) return false;
  return (
    row.timeIn === loaded.timeIn &&
    row.timeOut === loaded.timeOut &&
    row.timeIn2 === loaded.timeIn2 &&
    row.timeOut2 === loaded.timeOut2
  );
}

export function WeeklyReportForm({
  weeklyReportId,
  entries,
  totals: initialTotals,
  editable,
  weekEnd,
  priorAccomplishments,
  shift = null,
  usualTimes = null,
  usualTools = "",
  holidays = {},
  clarityAi = false,
}: {
  weeklyReportId: string;
  entries: DailyEntryRow[];
  totals: WeeklyTotals;
  editable: boolean;
  weekEnd: string;
  priorAccomplishments: string[];
  shift?: Shift | null;
  usualTimes?: DayTimes | null;
  usualTools?: string; // the last worked day's tools, prefilled on new days
  // This intern's applicable holidays by date (YYYY-MM-DD): PH holidays and company days off.
  holidays?: Record<string, { name: string; company: boolean }>;
  // AI assist's clarity coach can take a second look (lib/ai/jobs.ts "clarity" is on).
  clarityAi?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname(); // request links bring the intern back here (item 25)
  const holidayOn = (iso: string) => holidays[iso.slice(0, 10)];
  const holidayLabel = (iso: string) => {
    const h = holidayOn(iso);
    return h ? `${h.name} (${h.company ? "company day off" : "PH holiday"})` : "Holiday";
  };
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(entries.map((e) => [e.id, rowFromEntry(e, shift, usualTimes, usualTools)]))
  );
  // A day added with "Add a day" arrives after a refresh; give it a row without
  // dropping the unsaved edits on the other days.
  const missing = entries.filter((e) => !rows[e.id]);
  if (missing.length > 0) {
    setRows((prev) => ({
      ...prev,
      ...Object.fromEntries(
        missing.map((e) => [e.id, rowFromEntry(e, shift, usualTimes, usualTools)])
      ),
    }));
  }
  const [totals, setTotals] = useState(initialTotals);
  const [reasonForDelay, setReasonForDelay] = useState("");
  const [isPending, setIsPending] = useState(false);

  // Each day as the server last sent it; drafts restore only over an unchanged day.
  const serverRows = useMemo(
    () =>
      Object.fromEntries(
        entries.map((e) => [e.id, rowFromEntry(e, shift, usualTimes, usualTools)])
      ),
    [entries, shift, usualTimes, usualTools]
  );
  // Read after mount (the server render has no localStorage), once per report.
  const [draftChecked, setDraftChecked] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect -- localStorage is an external store only readable after hydration */
  useEffect(() => {
    if (!editable) {
      clearDraft(weeklyReportId);
      return;
    }
    const draft = loadDraft(weeklyReportId, serverRows);
    if (draft) {
      setRows((prev) => ({ ...prev, ...draft.rows }));
      const at = new Date(draft.savedAt).toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      toast.info(`Restored your unsaved changes from ${at}. Save draft to keep them.`, {
        id: `draft-${weeklyReportId}`,
      });
    }
    setDraftChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once, not on every refresh
  }, [weeklyReportId, editable]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (editable && draftChecked) saveDraft(weeklyReportId, rows, serverRows);
  }, [editable, draftChecked, weeklyReportId, rows, serverRows]);

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

  // Same check the server's submit gate runs (dayGaps), for scheduled PRESENT days.
  function rowGaps(entry: DailyEntryRow, row: RowState) {
    if (row.status !== "PRESENT" || entry.scheduledHours <= 0) return [];
    const valid = (t: string) => timeOfDay.safeParse(t).success;
    if (!valid(row.timeIn) || !valid(row.timeOut)) return [];
    const ranges: Array<[string, string]> = [[row.timeIn, row.timeOut]];
    if (valid(row.timeIn2) && valid(row.timeOut2)) ranges.push([row.timeIn2, row.timeOut2]);
    return dayGaps(ranges, shift);
  }

  // Efficiency item 24: Submit marks every day that needs fixing, not only the first.
  const [problems, setProblems] = useState<Record<string, DayProblem>>({});
  const [delayMissing, setDelayMissing] = useState(false);

  // Ties an input to its day's error text so screen readers read it with the field.
  function fieldProps(entryId: string, field: string) {
    return problems[entryId]?.field === field
      ? { "aria-invalid": true, "aria-describedby": `problem-${entryId}` }
      : {};
  }

  function updateRow(id: string, patch: Partial<RowState>) {
    setProblems((prev) => {
      if (!prev[id]) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
    setRows((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch, dirty: true, follows: false },
    }));
  }

  // A time typed on one day also fills the later days that are still blank, so a regular
  // week is typed once; any of them can still be changed.
  function updateTimes(id: string, next: RowState) {
    const patch = withAutoHours(next);
    setRows((prev) => {
      const out = { ...prev, [id]: { ...prev[id], ...patch, dirty: true, follows: false } };
      const later = entries.slice(entries.findIndex((e) => e.id === id) + 1);
      if (next.timeIn && next.timeOut) {
        for (const e of later) {
          const row = prev[e.id];
          const follows = row?.follows ?? followsTypedTimes(row, serverRows[e.id]);
          if (e.scheduledHours > 0 && follows) {
            out[e.id] = { ...row, ...patch, dirty: true, follows: true };
          }
        }
      }
      return out;
    });
  }

  // "Tools used" rarely changes within a week: once typed, later present days that are still
  // blank get the same text (they can still be changed).
  function carryToolsForward(id: string) {
    const tools = rows[id]?.toolsUsed.trim();
    if (!tools) return;
    setRows((prev) => {
      const out = { ...prev };
      for (const e of entries.slice(entries.findIndex((x) => x.id === id) + 1)) {
        const row = prev[e.id] ?? rowFromEntry(e, shift, usualTimes, usualTools);
        if (row.status === "PRESENT" && !row.toolsUsed.trim()) {
          out[e.id] = { ...row, toolsUsed: tools, dirty: true };
        }
      }
      return out;
    });
  }

  function rowProblem(entry: DailyEntryRow): DayProblem | null {
    const row = rows[entry.id] ?? rowFromEntry(entry, shift, usualTimes, usualTools);
    // Absent and holiday days count 0 hours and need no description.
    if (row.status !== "PRESENT") return null;
    if (row.hours === "" || Number.isNaN(Number(row.hours)))
      return { message: "Enter hours worked", field: "hours" };
    if (!row.accomplishments.trim())
      return { message: "Describe what you accomplished", field: "acc" };
    // Same rules the server enforces.
    const parsed = dailyEntrySchema.safeParse(rowPayload(entry.id, row));
    if (parsed.success) return null;
    const issue = parsed.error.issues[0];
    return {
      message: issue?.message ?? "Check this day's entry",
      field: FIELD_IDS[String(issue?.path[0])] ?? "acc",
    };
  }

  // Saves every changed day. Returns false (after a toast) if any failed.
  async function saveDirtyRows(): Promise<boolean> {
    for (const entry of entries) {
      const row = rows[entry.id];
      if (!row?.dirty) continue;
      const problem = rowProblem(entry);
      if (problem) {
        toast.error(`${formatDay(entry.reportDate)}: ${problem.message}`);
        return false;
      }
      const res = await sendJson(`/api/weekly-reports/${weeklyReportId}`, {
        method: "PATCH",
        body: rowPayload(entry.id, row),
      });
      if (!res.ok) {
        toast.error(`${formatDay(entry.reportDate)}: ${res.error}`);
        return false;
      }
      setTotals({
        totalHours: Number(res.body.totalHours),
        runningTotal: Number(res.body.runningTotal),
        conductDeductions: Number(res.body.conductDeductions),
        remainingHours: Number(res.body.remainingHours),
      });
      setRows((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], dirty: false } }));
    }
    return true;
  }

  // A day with saved text asks once more before it goes (the text goes with it).
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  async function removeAddedDay(entry: DailyEntryRow) {
    if (entry.accomplishments?.trim() && removeArmed !== entry.id) {
      setRemoveArmed(entry.id);
      return;
    }
    setRemoveArmed(null);
    setIsPending(true);
    const res = await sendJson(
      `/api/weekly-reports/${weeklyReportId}/entries?entryId=${entry.id}`,
      { method: "DELETE" }
    );
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${formatDay(entry.reportDate)} removed`);
    router.refresh();
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
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/preview`);
    if (!res.ok || typeof res.body.previewUrl !== "string") {
      toast.error(res.ok ? "Preview unavailable" : res.error);
      return;
    }
    window.open(res.body.previewUrl, "_blank", "noopener,noreferrer");
  }

  async function onSubmit() {
    if (hasCopyPaste) {
      toast.error("Rewrite the flagged entries — copied accomplishments can't be submitted");
      return;
    }
    const found: Record<string, DayProblem> = {};
    for (const entry of entries) {
      const problem = rowProblem(entry);
      if (problem) found[entry.id] = problem;
    }
    setProblems(found);
    const noReason = late && !reasonForDelay.trim();
    setDelayMissing(noReason);
    const bad = entries.filter((entry) => found[entry.id]);
    if (bad.length > 0) {
      toast.error(
        bad.length === 1
          ? `${formatDay(bad[0].reportDate)}: ${found[bad[0].id].message}`
          : `${bad.length} days need fixing; each is marked below`
      );
      focusField(bad[0].id, found[bad[0].id].field);
      return;
    }
    if (noReason) {
      toast.error("This report is late — add a reason for delay before submitting");
      document.getElementById(`delay-${weeklyReportId}`)?.focus();
      return;
    }

    setIsPending(true);
    const saved = await saveDirtyRows();
    if (!saved) {
      setIsPending(false);
      return;
    }
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/submit`, {
      method: "POST",
      body: late ? { reasonForDelay: reasonForDelay.trim() } : {},
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    clearDraft(weeklyReportId);
    toast.success(`Report submitted · reference ${String(res.body.referenceCode)}`);
    router.refresh();
    // Module 8: render the PDF (for supervisor signing) in the background. Failures are
    // recorded server-side as FAILED and offered as "Regenerate PDF".
    void generatePdfInBackground(`/api/weekly-reports/${weeklyReportId}/pdf`, () =>
      router.refresh()
    );
    // Workstream D: advisory AI in the background (no-op while AI is disabled;
    // the daily cron retries anything this misses).
    void fetch(`/api/weekly-reports/${weeklyReportId}/ai`, { method: "POST" }).catch(() => {});
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
        {/* Phones: one stacked row per day, so the accomplishment text keeps the full width. */}
        <ul className="divide-y sm:hidden">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-1 py-3 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium">
                  {formatDay(entry.reportDate)} ·{" "}
                  {entry.attendanceStatus === "HOLIDAY"
                    ? holidayLabel(entry.reportDate)
                    : (STATUS_LABEL[entry.attendanceStatus] ?? entry.attendanceStatus)}
                </span>
                <span className="whitespace-nowrap">
                  {entry.actualHours == null ? "—" : formatHrsMins(entry.actualHours)}
                  {entry.scheduledHours > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      / {formatHrsMins(entry.scheduledHours)}
                    </span>
                  )}
                </span>
              </p>
              {entry.timeIn && entry.timeOut && (
                <p className="text-xs text-muted-foreground">
                  {entry.timeIn}–{entry.timeOut}
                  {entry.timeIn2 && entry.timeOut2 && `, ${entry.timeIn2}–${entry.timeOut2}`}
                </p>
              )}
              <p className="whitespace-pre-wrap">{entry.accomplishments ?? "—"}</p>
              {entry.toolsUsed && (
                <p className="text-xs text-muted-foreground">Tools: {entry.toolsUsed}</p>
              )}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
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
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {formatDay(entry.reportDate)}
                  </td>
                  <td className="py-2 pr-3">
                    {entry.attendanceStatus === "HOLIDAY"
                      ? holidayLabel(entry.reportDate)
                      : (STATUS_LABEL[entry.attendanceStatus] ?? entry.attendanceStatus)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                    {entry.timeIn && entry.timeOut ? (
                      <>
                        {entry.timeIn}–{entry.timeOut}
                        {entry.timeIn2 && entry.timeOut2 && (
                          <>
                            <br />
                            {entry.timeIn2}–{entry.timeOut2}
                          </>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {entry.actualHours == null ? "—" : formatHrsMins(entry.actualHours)}
                    {entry.scheduledHours > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        / {formatHrsMins(entry.scheduledHours)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-pre-wrap">{entry.accomplishments ?? "—"}</td>
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
          const row = rows[entry.id] ?? rowFromEntry(entry, shift, usualTimes, usualTools);
          const flag = copyPasteFlags[entry.id];
          return (
            <div
              key={entry.id}
              id={`day-${entry.id}`}
              className={cn(
                "scroll-mt-6 space-y-3 rounded-lg border p-4",
                flag && "border-amber-300 bg-amber-50/50",
                problems[entry.id] && "border-red-300"
              )}
            >
              {/* One header line per day: what the day is on the left, its status on the right. */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {formatDay(entry.reportDate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.scheduledHours > 0
                      ? `${formatHrsMins(entry.scheduledHours)} scheduled`
                      : "Not a scheduled day"}
                    {row.status === "PRESENT" &&
                      row.hours !== "" &&
                      !Number.isNaN(Number(row.hours)) &&
                      ` · ${formatHrsMins(Number(row.hours))} worked`}
                    {row.dirty && <span className="text-amber-600"> · Unsaved</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {entry.scheduledHours === 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending || hasDirty}
                      onClick={() => removeAddedDay(entry)}
                      aria-label={`Remove ${formatDay(entry.reportDate)} from this report`}
                      className="h-8 cursor-pointer px-2 text-xs text-red-700"
                    >
                      {removeArmed === entry.id
                        ? "Click again to remove (with its text)"
                        : "Remove day"}
                    </Button>
                  )}
                  <Label htmlFor={`status-${entry.id}`} className="text-xs text-muted-foreground">
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
                          ? // Back to Present: clear the forced 0 so "Enter hours worked" applies again.
                            { status, hours: row.status === "PRESENT" ? row.hours : "" }
                          : {
                              status,
                              hours: "0",
                              timeIn: "",
                              timeOut: "",
                              timeIn2: "",
                              timeOut2: "",
                              toolsUsed: "",
                            }
                      );
                    }}
                    className="flex h-9 w-36 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm disabled:cursor-not-allowed"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    {/* Only a real holiday may be one; any other day off is an absence. */}
                    {(holidayOn(entry.reportDate) || row.status === "HOLIDAY") && (
                      <option value="HOLIDAY">Holiday</option>
                    )}
                  </select>
                </div>
              </div>
              {row.status === "PRESENT" ? (
                <>
                  {/* The day's times in one even row; two per row on a phone. */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label htmlFor={`in-${entry.id}`} className="text-xs whitespace-nowrap">
                        Time in
                      </Label>
                      <Input
                        id={`in-${entry.id}`}
                        {...fieldProps(entry.id, "in")}
                        type="time"
                        value={row.timeIn}
                        disabled={isPending}
                        onChange={(e) => updateTimes(entry.id, { ...row, timeIn: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`out-${entry.id}`} className="text-xs whitespace-nowrap">
                        Time out
                      </Label>
                      <Input
                        id={`out-${entry.id}`}
                        {...fieldProps(entry.id, "out")}
                        type="time"
                        value={row.timeOut}
                        disabled={isPending}
                        onChange={(e) => updateTimes(entry.id, { ...row, timeOut: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`in2-${entry.id}`} className="text-xs whitespace-nowrap">
                        Afternoon in
                      </Label>
                      <Input
                        id={`in2-${entry.id}`}
                        {...fieldProps(entry.id, "in2")}
                        type="time"
                        value={row.timeIn2}
                        disabled={isPending}
                        onChange={(e) => updateTimes(entry.id, { ...row, timeIn2: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`out2-${entry.id}`} className="text-xs whitespace-nowrap">
                        Afternoon out
                      </Label>
                      <Input
                        id={`out2-${entry.id}`}
                        {...fieldProps(entry.id, "out2")}
                        type="time"
                        value={row.timeOut2}
                        disabled={isPending}
                        onChange={(e) =>
                          updateTimes(entry.id, { ...row, timeOut2: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`hours-${entry.id}`} className="text-xs">
                        Hours
                      </Label>
                      <Input
                        id={`hours-${entry.id}`}
                        {...fieldProps(entry.id, "hours")}
                        type="number"
                        min={0}
                        max={24}
                        step={0.25}
                        value={row.hours}
                        disabled={isPending}
                        onChange={(e) => updateRow(entry.id, { hours: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="space-y-1">
                      <Label htmlFor={`acc-${entry.id}`} className="text-xs">
                        Accomplishments
                      </Label>
                      <Textarea
                        id={`acc-${entry.id}`}
                        {...fieldProps(entry.id, "acc")}
                        rows={3}
                        value={row.accomplishments}
                        disabled={isPending}
                        onChange={(e) => updateRow(entry.id, { accomplishments: e.target.value })}
                        placeholder="What did you work on and finish today?"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`tools-${entry.id}`} className="text-xs">
                        Tools used <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id={`tools-${entry.id}`}
                        {...fieldProps(entry.id, "tools")}
                        value={row.toolsUsed}
                        disabled={isPending}
                        onChange={(e) => updateRow(entry.id, { toolsUsed: e.target.value })}
                        onBlur={() => carryToolsForward(entry.id)}
                        placeholder="e.g. VS Code, Figma"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {row.status === "HOLIDAY" ? holidayLabel(entry.reportDate) : "Absent"} — counts 0
                  hours; no accomplishments needed.
                  {row.status === "ABSENT" && (
                    <>
                      {" "}
                      Give the reason in an{" "}
                      <Link
                        href={`/leave-requests?${new URLSearchParams({
                          deviationType: "ABSENCE",
                          date: entry.reportDate.slice(0, 10),
                          returnTo: pathname,
                        })}`}
                        className="underline"
                      >
                        absence request
                      </Link>
                      , and upload its attachments (medical certificate, letter) to Google
                      Classroom.
                    </>
                  )}
                </p>
              )}
              {problems[entry.id] && (
                <p
                  id={`problem-${entry.id}`}
                  className="flex items-center gap-1.5 text-xs text-red-700"
                >
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {problems[entry.id].message}
                </p>
              )}
              {flag && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {flag} — please describe this day&apos;s work in your own words.
                </p>
              )}
              {rowGaps(entry, row).map((gap) => (
                <p key={gap.kind} className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {gap.kind === "late"
                    ? "Late arrival: marked for your adviser, who decides whether it counts. To explain it,"
                    : "Early leave: file an undertime request"}{" "}
                  —{" "}
                  <Link
                    href={`/leave-requests?${new URLSearchParams({
                      deviationType: "UNDERTIME",
                      date: entry.reportDate.slice(0, 10),
                      startTime: gap.start,
                      endTime: gap.end,
                      returnTo: pathname,
                    })}`}
                    className="underline"
                  >
                    open the request form
                  </Link>
                </p>
              ))}
            </div>
          );
        })}
      </div>

      <AddDayControl
        weeklyReportId={weeklyReportId}
        weekEnd={weekEndDate}
        takenDates={entries.map((e) => e.reportDate.slice(0, 10))}
        disabled={isPending || hasDirty}
        onAdded={() => router.refresh()}
      />

      {late && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <Label htmlFor={`delay-${weeklyReportId}`} className="text-red-700">
            Reason for delay (required — due{" "}
            {dueDate.toLocaleDateString("en-PH", {
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
            onChange={(e) => {
              setReasonForDelay(e.target.value);
              setDelayMissing(false);
            }}
            placeholder="Your faculty adviser will see this note"
            {...(delayMissing && {
              "aria-invalid": true,
              "aria-describedby": `delay-error-${weeklyReportId}`,
            })}
          />
          {delayMissing && (
            <p
              id={`delay-error-${weeklyReportId}`}
              className="flex items-center gap-1.5 text-xs text-red-700"
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Add a reason for delay before submitting
            </p>
          )}
        </div>
      )}

      <ClarityCoach
        aiOn={clarityAi}
        days={entries
          .filter((e) => rows[e.id]?.status === "PRESENT")
          .map((e) => ({
            id: e.id,
            label: formatDay(e.reportDate),
            text: rows[e.id]?.accomplishments ?? "",
            tools: rows[e.id]?.toolsUsed ?? null,
          }))}
      />

      {/* Error summary: every blocker in one place, each a link to the field to fix. */}
      <div role="alert" aria-live="assertive">
        {(Object.keys(problems).length > 0 || delayMissing) && (
          <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Fix these before submitting:</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {entries
                .filter((e) => problems[e.id])
                .map((e) => (
                  <li key={e.id}>
                    <a
                      href={`#${problems[e.id].field}-${e.id}`}
                      className="underline"
                      onClick={(ev) => {
                        ev.preventDefault();
                        focusField(e.id, problems[e.id].field);
                      }}
                    >
                      {formatDay(e.reportDate)}: {problems[e.id].message}
                    </a>
                  </li>
                ))}
              {delayMissing && (
                <li>
                  <a href={`#delay-${weeklyReportId}`} className="underline">
                    Reason for delay is required
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
      {/* Announces save and submit progress to screen readers (toasts can be missed). */}
      <p role="status" className="sr-only">
        {isPending ? "Saving your report…" : ""}
      </p>

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
          {isPending ? "Submitting..." : "Submit and generate PDF"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Next: download the PDF, have your HTE supervisor sign it and upload it to Google Classroom.
        Your faculty adviser approves it from there.
      </p>
    </div>
  );
}
