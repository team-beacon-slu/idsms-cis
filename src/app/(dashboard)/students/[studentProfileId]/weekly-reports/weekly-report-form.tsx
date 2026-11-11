"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ClarityCoach } from "@/components/ai/clarity-coach";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ChevronDown,
  Eye,
  Plus,
  Save,
  Send,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WeekTimetable, type TimetableCell } from "@/components/week-timetable";
import { cn } from "@/lib/utils";
import { getWeeklyReportDueDate, isWeeklyReportLate } from "@/lib/utils/reportDeadline";
import {
  DAY_NOTE_MIN,
  dailyEntrySchema,
  isAttendanceStatus,
  rangeMinutes,
  type AttendanceStatus,
} from "@/lib/validators/report";
import { addDays, toDateKey } from "@/lib/utils/reportDeadline";
import {
  dayExceptions,
  formatHrsMins,
  timeOfDay,
  toHHMM,
  type DayException,
  type Shift,
} from "@/lib/utils/timeMath";
import { clock, clockShort, WEEKDAY_LONG, WEEKDAY_SHORT } from "@/lib/utils/schedule";
import { sendJson } from "@/lib/utils/sendJson";
import { reportDays, type ReportDay } from "@/lib/utils/reportWeek";
import { clearDraft, loadDraft, saveDraft } from "@/lib/utils/reportDraft";
import { detectCopyPasteWarning } from "./copy-paste-warning";
import { generatePdfInBackground } from "./report-pdf-actions";
import { RequestReviewActions } from "../leave-requests/request-review-actions";

// FR-WR-02, FR-WR-03: the intern's week, one folded row per day (exception-based, Nov 2026
// adviser feedback): every scheduled day starts filled in from the schedule, so the intern
// opens a day, writes what they did, and only explains a day that differs from the schedule.
// Overtime, undertime and absences are reported on that day with a reason (no separate
// requests); the server records them (lib/services/attendance/reportedTimeRecords.ts).
// "Save draft" PATCHes every changed day in order; "Submit" saves first, then POSTs
// /api/weekly-reports/[id]/submit. Copy-paste checks (previous week, other days) block submit.

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
  timeIn2: string | null; // optional second range
  timeOut2: string | null;
}

// A day's clock times; the intern's usual ones prefill days the schedule gives no times for.
export interface DayTimes {
  timeIn: string;
  timeOut: string;
  timeIn2: string;
  timeOut2: string;
}

// Why a reported day differs from the schedule, as saved (by date "YYYY-MM-DD").
export interface DayNoteRow {
  reason: string;
  proofType?: string;
  requestKind?: string;
  // The adviser's decision on each saved record of that day (overtime, undertime, absence).
  records?: Array<{ id: string; type: string; status: string; adviserNote: string | null }>;
}

const RECORD_TYPE: Record<string, string> = {
  OVERTIME: "Overtime",
  UNDERTIME: "Undertime",
  ABSENCE: "Absence",
};
const DECISION: Record<string, { text: string; className: string }> = {
  PENDING: { text: "Waiting for your adviser", className: "bg-muted text-muted-foreground" },
  VALIDATED: {
    text: "Accepted",
    className: "bg-status-done/15 text-foreground",
  },
  REJECTED: {
    text: "Not accepted",
    className: "bg-danger-soft text-danger-soft-foreground",
  },
};

// Where each saved overtime / undertime / absence stands. The adviser accepts or not (and can
// change their mind); the intern sees the decision and the adviser's note.
function Decisions({
  note,
  dayLabel,
  reviewable,
}: {
  note: DayNoteRow | undefined;
  dayLabel: string;
  reviewable: boolean;
}) {
  if (!note?.records?.length) return null;
  return (
    <ul className="space-y-1.5">
      {note.records.map((r) => {
        const d = DECISION[r.status] ?? DECISION.PENDING;
        const type = RECORD_TYPE[r.type] ?? r.type;
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", d.className)}>
              {type}: {reviewable && r.status === "PENDING" ? "not decided yet" : d.text}
            </span>
            {r.status === "REJECTED" && r.adviserNote && (
              <span className="text-danger-soft-foreground">Adviser: {r.adviserNote}</span>
            )}
            {reviewable && (
              <RequestReviewActions
                requestId={r.id}
                label={`${type} on ${dayLabel}`}
                canApprove={r.status !== "VALIDATED"}
                canReturn={r.status !== "REJECTED"}
                wording="reason"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface WeeklyTotals {
  totalHours: number;
  runningTotal: number; // hours worked, before deductions
  conductDeductions: number;
  remainingHours: number; // after deductions
}

type Kind = "ANTICIPATED" | "EMERGENCY";

interface RowState {
  status: AttendanceStatus;
  hours: string;
  timeIn: string;
  timeOut: string;
  timeIn2: string;
  timeOut2: string;
  split: boolean; // shows the second time range
  accomplishments: string;
  toolsUsed: string;
  reason: string;
  proofType: string;
  requestKind: Kind;
  dirty: boolean; // differs from the server (prefilled days too): Save sends it
  edited?: boolean; // the intern changed it here: shows "Unsaved"
}

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
  SCHEDULED: "Not filled",
};

export const PROOF_LABEL: Record<string, string> = {
  MEDICAL_CERTIFICATE: "Medical certificate",
  PROOF_OF_LEAVE: "Proof of leave (e.g. a letter)",
  WRITTEN_NOTICE: "Written notice to your supervisor",
};

const valid = (t: string) => timeOfDay.safeParse(t).success;

// Hours follow the times (both ranges); credited hours under SLU's rules come from the server.
function withAutoHours(row: RowState): Partial<RowState> {
  const times = {
    timeIn: row.timeIn,
    timeOut: row.timeOut,
    timeIn2: row.split ? row.timeIn2 : "",
    timeOut2: row.split ? row.timeOut2 : "",
  };
  const minutes = valid(row.timeIn) && valid(row.timeOut) ? rangeMinutes(times) : 0;
  return { ...times, hours: minutes > 0 ? String(Math.round((minutes / 60) * 100) / 100) : "" };
}

// What makes this day differ from the schedule, read from its times (none unless Present).
function exceptionsOf(entry: DailyEntryRow, row: RowState, shift: Shift | null): DayException[] {
  if (row.status !== "PRESENT" || !valid(row.timeIn) || !valid(row.timeOut)) return [];
  const ranges: Array<[string, string]> = [[row.timeIn, row.timeOut]];
  if (row.split && valid(row.timeIn2) && valid(row.timeOut2)) {
    ranges.push([row.timeIn2, row.timeOut2]);
  }
  return dayExceptions(ranges, shift, entry.scheduledHours > 0, entry.scheduledHours).filter(
    (x) => x.minutes > 0
  );
}

// The PATCH body for one row; also what dayProblem validates.
function rowPayload(entry: DailyEntryRow, row: RowState, shift: Shift | null) {
  const present = row.status === "PRESENT";
  const reason = row.reason.trim();
  const note =
    row.status === "ABSENT"
      ? {
          reason,
          ...(row.proofType ? { proofType: row.proofType } : {}),
          requestKind: row.requestKind,
        }
      : present
        ? { reason: exceptionsOf(entry, row, shift).length > 0 ? reason : "" }
        : undefined;
  return {
    dailyReportEntryId: entry.id,
    hours: present ? Number(row.hours) : 0,
    accomplishments: present ? row.accomplishments.trim() : "",
    toolsUsed: (present && row.toolsUsed.trim()) || undefined,
    attendanceStatus: row.status,
    timeIn: (present && row.timeIn) || undefined,
    timeOut: (present && row.timeOut) || undefined,
    timeIn2: (present && row.split && row.timeIn2) || undefined,
    timeOut2: (present && row.split && row.timeOut2) || undefined,
    note,
  };
}

// A day that can't be submitted: the message and which input (by id prefix) to fix.
type DayProblem = { message: string; field: string };

// dailyEntrySchema paths -> the id prefix of the input that holds them.
const FIELD_IDS: Record<string, string> = {
  hours: "in",
  accomplishments: "acc",
  toolsUsed: "tools",
  timeIn: "in",
  timeOut: "out",
  timeIn2: "in2",
  timeOut2: "out2",
  reason: "reason",
  proofType: "proof",
};

function dayProblem(entry: DailyEntryRow, row: RowState, shift: Shift | null): DayProblem | null {
  const reason = row.reason.trim();
  if (row.status === "ABSENT") {
    if (reason.length < DAY_NOTE_MIN) {
      return {
        message: `Say why you were absent (at least ${DAY_NOTE_MIN} characters)`,
        field: "reason",
      };
    }
    if (!row.proofType) return { message: "Choose the proof you'll upload", field: "proof" };
    return null;
  }
  if (row.status !== "PRESENT") return null;
  if (!valid(row.timeIn) || !valid(row.timeOut)) {
    return { message: "Enter your time in and time out", field: valid(row.timeIn) ? "out" : "in" };
  }
  if (!row.accomplishments.trim()) {
    return { message: "Describe what you accomplished", field: "acc" };
  }
  const exceptions = exceptionsOf(entry, row, shift);
  if (exceptions.some((x) => x.kind === "early") && reason.length < DAY_NOTE_MIN) {
    return {
      message: `Say why you left early (at least ${DAY_NOTE_MIN} characters)`,
      field: "reason",
    };
  }
  if (exceptions.length > 0 && reason.length > 0 && reason.length < DAY_NOTE_MIN) {
    return { message: `Give a reason of at least ${DAY_NOTE_MIN} characters`, field: "reason" };
  }
  // Same rules the server enforces.
  const parsed = dailyEntrySchema.safeParse(rowPayload(entry, row, shift));
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const key = String(issue?.path[0] === "note" ? issue?.path[1] : issue?.path[0]);
  return { message: issue?.message ?? "Check this day's entry", field: FIELD_IDS[key] ?? "acc" };
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const rangeText = (start: string, end: string) => `${clock(start)} – ${clock(end)}`;

function exceptionText(x: DayException): string {
  const span = x.start && x.end ? ` ${rangeText(x.start, x.end)}` : "";
  const length = formatHrsMins(x.minutes / 60);
  if (x.kind === "overtime") return `Overtime${span} (${length})`;
  if (x.kind === "late") return `Late arrival${span} (${length})`;
  return span ? `Left early${span} (${length})` : `Undertime: ${length} less than scheduled`;
}

function TotalsBar({ totals }: { totals: WeeklyTotals }) {
  const items = [
    ["This week", formatHrsMins(totals.totalHours)],
    ["Running total", formatHrsMins(totals.runningTotal)],
    [
      "Deductions",
      `${totals.conductDeductions > 0 ? "−" : ""}${formatHrsMins(totals.conductDeductions)}`,
    ],
    ["Remaining", formatHrsMins(totals.remainingHours)],
  ];
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-1.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd
            className={cn(
              "font-semibold tabular-nums",
              label === "Deductions" && totals.conductDeductions > 0
                ? "text-destructive"
                : "text-foreground"
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Present / Absent / Holiday as one row of chips (a radio group, arrow keys move).
function StatusChips({
  entryId,
  dayLabel,
  value,
  holiday,
  disabled,
  onChange,
}: {
  entryId: string;
  dayLabel: string;
  value: AttendanceStatus;
  holiday: boolean;
  disabled: boolean;
  onChange: (status: AttendanceStatus) => void;
}) {
  const options: AttendanceStatus[] =
    holiday || value === "HOLIDAY" ? ["PRESENT", "ABSENT", "HOLIDAY"] : ["PRESENT", "ABSENT"];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKey(e: KeyboardEvent, i: number) {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;
    e.preventDefault();
    const next = (i + (forward ? 1 : -1) + options.length) % options.length;
    onChange(options[next]);
    refs.current[next]?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label={`Status on ${dayLabel}`}
      id={`status-${entryId}`}
      className="flex flex-wrap gap-2"
    >
      {options.map((s, i) => {
        const on = value === s;
        return (
          <button
            key={s}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(s)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "h-9 cursor-pointer rounded-full border px-4 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
              on
                ? s === "ABSENT"
                  ? "border-status-alert bg-danger-soft font-medium text-danger-soft-foreground"
                  : "border-primary bg-primary/10 font-medium text-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

// Adds a day outside the schedule that was worked (overtime). Disabled while there are
// unsaved edits, since adding refreshes the page.
function AddDayControl({
  weeklyReportId,
  weekEnd,
  takenDates,
  disabled,
  date,
  onDate,
  onAdded,
}: {
  weeklyReportId: string;
  weekEnd: Date;
  takenDates: string[];
  disabled: boolean;
  date: string;
  onDate: (date: string) => void;
  onAdded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Weekdays are always listed (a day off has its own "I worked this day"); this adds a weekend.
  const min = toDateKey(addDays(weekEnd, -1));
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
    onDate("");
    toast.success("Day added: fill in your times, what you did and what the overtime was for");
    onAdded();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 pt-2">
      <div className="space-y-1">
        <Label htmlFor={`add-day-${weeklyReportId}`} className="text-xs">
          Saturday or Sunday you worked
        </Label>
        <Input
          id={`add-day-${weeklyReportId}`}
          type="date"
          min={min}
          max={max}
          value={date}
          disabled={disabled || busy}
          onChange={(e) => onDate(e.target.value)}
          className="w-44"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={add}
        disabled={disabled || busy || !date}
        className="h-9 cursor-pointer gap-1.5 disabled:cursor-not-allowed"
      >
        <CalendarPlus className="size-3.5" aria-hidden="true" />
        {busy ? "Adding..." : "Add this day"}
      </Button>
    </div>
  );
}

const EMPTY_TIMES = { timeIn: "", timeOut: "", timeIn2: "", timeOut2: "" };

// The schedule's times for a day (or the usual ones), with hours to match.
function defaultTimes(
  e: DailyEntryRow,
  shift: Shift | null,
  usual: DayTimes | null
): Partial<RowState> {
  if (shift && e.scheduledHours > 0) {
    return {
      hours: String(shift.scheduledHours),
      timeIn: toHHMM(shift.startMin),
      timeOut: toHHMM(shift.endMin),
      timeIn2: "",
      timeOut2: "",
      split: false,
    };
  }
  if (usual) {
    const split = Boolean(usual.timeIn2 && usual.timeOut2);
    return { split, ...withAutoHours({ ...EMPTY_TIMES, ...usual, split } as RowState) };
  }
  return {};
}

function rowFromEntry(
  e: DailyEntryRow,
  shift: Shift | null = null,
  usual: DayTimes | null = null,
  usualTools = "",
  note: DayNoteRow | undefined = undefined
): RowState {
  // An unfilled scheduled day starts as Present at the schedule's times, else at the times
  // of the intern's last worked day (the adviser: fewer things to type).
  const unfilled = e.scheduledHours > 0 && e.actualHours == null && !e.timeIn;
  const base: RowState = {
    status: isAttendanceStatus(e.attendanceStatus) ? e.attendanceStatus : "PRESENT",
    hours: e.actualHours == null ? "" : String(e.actualHours),
    timeIn: e.timeIn ?? "",
    timeOut: e.timeOut ?? "",
    timeIn2: e.timeIn2 ?? "",
    timeOut2: e.timeOut2 ?? "",
    split: Boolean(e.timeIn2 || e.timeOut2),
    accomplishments: e.accomplishments ?? "",
    toolsUsed: e.toolsUsed ?? "",
    reason: note?.reason ?? "",
    proofType: note?.proofType ?? "",
    requestKind: note?.requestKind === "ANTICIPATED" ? "ANTICIPATED" : "EMERGENCY",
    dirty: false,
  };
  if (!unfilled || base.status !== "PRESENT") return base;
  // Tools rarely change day to day: start from the last worked day's, like the times.
  base.toolsUsed ||= usualTools;
  const times = defaultTimes(e, shift, usual);
  return Object.keys(times).length ? { ...base, ...times, dirty: true } : base; // Save sends them
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
  notes = {},
  clarityAi = false,
  reviewable = false,
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
  // Reasons already reported on this week's days, by date (YYYY-MM-DD).
  notes?: Record<string, DayNoteRow>;
  // AI assist's clarity coach can take a second look (lib/ai/jobs.ts "clarity" is on).
  clarityAi?: boolean;
  // The viewer is staff who can accept or not each reported reason (read-only views).
  reviewable?: boolean;
}) {
  const router = useRouter();
  const holidayOn = (iso: string) => holidays[iso.slice(0, 10)];
  const holidayLabel = (iso: string) => {
    const h = holidayOn(iso);
    return h ? `${h.name} (${h.company ? "company day off" : "PH holiday"})` : "Holiday";
  };
  const noteOf = (e: DailyEntryRow) => notes[e.reportDate.slice(0, 10)];
  const fresh = (e: DailyEntryRow) => rowFromEntry(e, shift, usualTimes, usualTools, noteOf(e));

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(entries.map((e) => [e.id, fresh(e)]))
  );
  // A day added with "Add this day" arrives after a refresh; give it a row without
  // dropping the unsaved edits on the other days.
  const missing = entries.filter((e) => !rows[e.id]);
  if (missing.length > 0) {
    setRows((prev) => ({ ...prev, ...Object.fromEntries(missing.map((e) => [e.id, fresh(e)])) }));
  }
  const [totals, setTotals] = useState(initialTotals);
  // A refresh (an adviser's decision, a save elsewhere) brings new totals from the server.
  const serverTotalsKey = JSON.stringify(initialTotals);
  const [seenTotalsKey, setSeenTotalsKey] = useState(serverTotalsKey);
  if (seenTotalsKey !== serverTotalsKey) {
    setSeenTotalsKey(serverTotalsKey);
    setTotals(initialTotals);
  }
  const [reasonForDelay, setReasonForDelay] = useState("");
  const [isPending, setIsPending] = useState(false);

  // Each day as the server last sent it; drafts restore only over an unchanged day.
  const serverRows = useMemo(
    () => Object.fromEntries(entries.map((e) => [e.id, fresh(e)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fresh reads only these
    [entries, shift, usualTimes, usualTools, notes]
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

  // Efficiency item 24: Submit marks every day that needs fixing, not only the first.
  const [problems, setProblems] = useState<Record<string, DayProblem>>({});
  const [delayMissing, setDelayMissing] = useState(false);

  // One day open to start: the first that still needs something.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const first = entries.find((e) => dayProblem(e, fresh(e), shift));
    return first ? { [first.id]: true } : {};
  });
  const [addDate, setAddDate] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // Ties an input to its day's error text so screen readers read it with the field.
  function fieldProps(entryId: string, field: string) {
    return problems[entryId]?.field === field
      ? { "aria-invalid": true, "aria-describedby": `problem-${entryId}` }
      : {};
  }

  // A field inside a folded day: open the day first, then focus it on the next frame.
  function focusField(entryId: string, field: string) {
    setOpen((prev) => ({ ...prev, [entryId]: true }));
    requestAnimationFrame(() => {
      const el =
        document.getElementById(`${field}-${entryId}`) ?? document.getElementById(`day-${entryId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus({ preventScroll: true });
    });
  }

  function updateRow(id: string, patch: Partial<RowState>) {
    setProblems((prev) => {
      if (!prev[id]) return prev;
      const rest = { ...prev };
      delete rest[id];
      return rest;
    });
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, dirty: true, edited: true } }));
  }

  // A time change applies to this day only: overtime or an early out on one day is not the
  // intern's new schedule (adviser feedback, Nov 2026). Every day already starts prefilled.
  function updateTimes(id: string, next: RowState) {
    updateRow(id, { split: next.split, ...withAutoHours(next) });
  }

  function setStatus(entry: DailyEntryRow, row: RowState, status: AttendanceStatus) {
    if (status === row.status) return;
    if (status === "PRESENT") {
      // Back to Present: start again from the schedule's times.
      const times = row.timeIn ? {} : defaultTimes(entry, shift, usualTimes);
      updateRow(entry.id, { status, ...times });
      return;
    }
    updateRow(entry.id, {
      status,
      hours: "0",
      ...EMPTY_TIMES,
      split: false,
      toolsUsed: "",
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
        const row = prev[e.id] ?? fresh(e);
        if (row.status === "PRESENT" && !row.toolsUsed.trim()) {
          out[e.id] = { ...row, toolsUsed: tools, dirty: true };
        }
      }
      return out;
    });
  }

  const rowOf = (entry: DailyEntryRow) => rows[entry.id] ?? fresh(entry);
  const problemOf = (entry: DailyEntryRow) => dayProblem(entry, rowOf(entry), shift);

  // Saves every changed day. Returns false (after a toast) if any failed.
  // Saves every changed day. Submit (strict) stops at the first day that isn't ready; Save
  // draft saves the ready ones and leaves the rest on this device (the draft keeps them), so
  // writing one day at a time always works. Returns false (after a toast) if Submit can't go on.
  async function saveDirtyRows(strict: boolean): Promise<{ ok: boolean; waiting: string[] }> {
    const waiting: string[] = [];
    for (const entry of entries) {
      const row = rows[entry.id];
      if (!row?.dirty) continue;
      const problem = problemOf(entry);
      if (problem) {
        if (!strict) {
          // Untouched prefilled days wait quietly; a day the intern worked on says why.
          if (row.edited) {
            waiting.push(`${formatDay(entry.reportDate)}: ${problem.message}`);
            setProblems((prev) => ({ ...prev, [entry.id]: problem }));
          }
          continue;
        }
        toast.error(`${formatDay(entry.reportDate)}: ${problem.message}`);
        setProblems((prev) => ({ ...prev, [entry.id]: problem }));
        focusField(entry.id, problem.field);
        return { ok: false, waiting };
      }
      const res = await sendJson(`/api/weekly-reports/${weeklyReportId}`, {
        method: "PATCH",
        body: rowPayload(entry, row, shift),
      });
      if (!res.ok) {
        toast.error(`${formatDay(entry.reportDate)}: ${res.error}`);
        return { ok: false, waiting };
      }
      setTotals({
        totalHours: Number(res.body.totalHours),
        runningTotal: Number(res.body.runningTotal),
        conductDeductions: Number(res.body.conductDeductions),
        remainingHours: Number(res.body.remainingHours),
      });
      setRows((prev) => ({
        ...prev,
        [entry.id]: { ...prev[entry.id], dirty: false, edited: false },
      }));
    }
    return { ok: true, waiting };
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
    const { ok, waiting } = await saveDirtyRows(false);
    setIsPending(false);
    if (!ok) return;
    if (waiting.length > 0) {
      toast.info(
        `Saved the finished days. Still to do: ${waiting.join("; ")}. What you typed stays on this device.`,
        { duration: 8000 }
      );
    } else {
      toast.success("Draft saved");
    }
    router.refresh();
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
      const problem = problemOf(entry);
      if (problem) found[entry.id] = problem;
    }
    setProblems(found);
    const noReason = late && !reasonForDelay.trim();
    setDelayMissing(noReason);
    const bad = entries.filter((entry) => found[entry.id]);
    if (bad.length > 0) {
      // Every day that needs fixing opens, so each message sits next to its field.
      setOpen((prev) => ({ ...prev, ...Object.fromEntries(bad.map((e) => [e.id, true])) }));
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
    const { ok: saved } = await saveDirtyRows(true);
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

  function openDay(id: string) {
    setOpen((prev) => ({ ...prev, [id]: true }));
    requestAnimationFrame(() =>
      document.getElementById(`day-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  // The report's days: Monday to Friday always, Saturday/Sunday only when worked (SLU policy).
  const weekStart = addDays(weekEndDate, -6);
  const days = reportDays(weekStart, entries);
  const cells: TimetableCell[] = days.map(({ date: d, key, entry }): TimetableCell => {
    const base = {
      key,
      weekday: WEEKDAY_SHORT[d.getUTCDay()],
      date: String(d.getUTCDate()),
    };
    const long = `${WEEKDAY_LONG[d.getUTCDay()]} ${d.getUTCDate()}`;
    if (!entry) {
      const h = holidays[key];
      return {
        ...base,
        tone: h ? "holiday" : "off",
        label: h ? "Holiday" : "Day off",
        shortLabel: h ? "Holiday" : "Off",
        description: `${long}: ${h ? h.name : "a day off in your schedule"}`,
        onSelect: () =>
          document
            .getElementById(`off-${weeklyReportId}-${key}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      };
    }
    const row = rowOf(entry);
    const cell = { ...base, onSelect: () => openDay(entry.id) };
    if (row.status === "HOLIDAY") {
      return { ...cell, tone: "holiday", label: "Holiday", description: `${long}: holiday` };
    }
    const issue = problems[entry.id] ?? null;
    const ready = !problemOf(entry);
    if (row.status === "ABSENT") {
      return {
        ...cell,
        tone: ready ? "absent" : "flag",
        label: "Absent",
        short: ready ? undefined : "reason?",
        detail: ready ? undefined : "Reason needed",
        description: `${long}: absent${ready ? "" : ", reason needed"}`,
      };
    }
    const hours = Number(row.hours);
    const hrs = row.hours !== "" && !Number.isNaN(hours) ? formatHrsMins(hours) : "";
    const ot = exceptionsOf(entry, row, shift).some((x) => x.kind === "overtime");
    return {
      ...cell,
      tone: issue ? "flag" : entry.scheduledHours === 0 ? "extra" : ready ? "done" : "todo",
      label: issue ? "Fix" : ready ? "Ready" : "To fill",
      shortLabel: issue ? "Fix" : ready ? "Ready" : "Fill",
      short: hrs.replace(/ hrs?/, "h").replace(/ mins?/, "m"),
      detail: `${hrs}${ot ? " · OT" : ""}`,
      description: `${long}: ${issue ? issue.message : ready ? "ready" : "not written yet"}${hrs ? `, ${hrs}` : ""}${ot ? ", overtime" : ""}`,
    };
  });

  // A weekday off was worked after all: it joins the report as an overtime day.
  const [addingDay, setAddingDay] = useState<string | null>(null);
  async function addWorkedDay(key: string) {
    setAddingDay(key);
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/entries`, {
      method: "POST",
      body: { reportDate: key },
    });
    setAddingDay(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Day added: fill in your times, what you did and what the overtime was for");
    router.refresh();
  }

  // A weekday the schedule has off (or a holiday) with nothing worked: one quiet line.
  function offDayLine(day: ReportDay<DailyEntryRow>, canAdd: boolean) {
    const h = holidays[day.key];
    const label = formatDay(day.date.toISOString());
    return (
      <div
        key={day.key}
        id={`off-${weeklyReportId}-${day.key}`}
        className="flex min-h-12 scroll-mt-6 flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-2"
      >
        <span className="text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            {h
              ? `${h.name} (${h.company ? "company day off" : "PH holiday"})`
              : "Day off in your schedule"}
          </span>
        </span>
        {canAdd && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending || addingDay !== null}
            onClick={() => addWorkedDay(day.key)}
            aria-label={`I worked on ${label}`}
            className="h-8 cursor-pointer gap-1 px-2 text-xs text-primary"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {addingDay === day.key ? "Adding..." : "I worked this day"}
          </Button>
        )}
      </div>
    );
  }
  const readyCount = entries.filter((e) => !problemOf(e)).length;

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No scheduled working days fall in this week.
      </p>
    );
  }

  if (!editable) {
    const noteLine = (entry: DailyEntryRow) => {
      const note = noteOf(entry);
      if (!note) return null;
      const what =
        entry.attendanceStatus === "ABSENT"
          ? `Absence${note.proofType ? ` · proof: ${PROOF_LABEL[note.proofType] ?? note.proofType}` : ""}`
          : exceptionsOf(entry, rowOf(entry), shift).map(exceptionText).join(" · ") || "Reason";
      return (
        <div className="space-y-1.5 rounded-md bg-notice px-2 py-1.5 text-xs text-notice-foreground">
          <p>
            <span className="font-medium">{what}:</span> {note.reason}
          </p>
          <Decisions note={note} dayLabel={formatDay(entry.reportDate)} reviewable={reviewable} />
        </div>
      );
    };
    return (
      <div data-testid="weekly-report-form" className="space-y-3">
        <TotalsBar totals={totals} />
        <WeekTimetable
          cells={cells.map((c) => ({ ...c, onSelect: undefined }))}
          label="This week"
        />
        {/* Phones: one stacked row per day, so the accomplishment text keeps the full width. */}
        <ul className="divide-y sm:hidden">
          {days.map(({ key, date, entry }) =>
            !entry ? (
              <li key={key} className="py-3 text-sm text-muted-foreground">
                {formatDay(date.toISOString())} · {holidays[key]?.name ?? "Day off"}
              </li>
            ) : (
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
                    {rangeText(entry.timeIn, entry.timeOut)}
                    {entry.timeIn2 &&
                      entry.timeOut2 &&
                      `, ${rangeText(entry.timeIn2, entry.timeOut2)}`}
                  </p>
                )}
                {noteLine(entry)}
                <p className="whitespace-pre-wrap">{entry.accomplishments || "—"}</p>
                {entry.toolsUsed && (
                  <p className="text-xs text-muted-foreground">Tools: {entry.toolsUsed}</p>
                )}
              </li>
            )
          )}
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
              {days.map(({ key, date, entry }) =>
                !entry ? (
                  <tr key={key} className="border-b align-top text-muted-foreground last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDay(date.toISOString())}</td>
                    <td className="py-2 pr-3" colSpan={5}>
                      {holidays[key] ? holidayLabel(date.toISOString()) : "Day off in the schedule"}
                    </td>
                  </tr>
                ) : (
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
                          {rangeText(entry.timeIn, entry.timeOut)}
                          {entry.timeIn2 && entry.timeOut2 && (
                            <>
                              <br />
                              {rangeText(entry.timeIn2, entry.timeOut2)}
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
                    <td className="space-y-1 py-2 pr-3">
                      <p className="whitespace-pre-wrap">{entry.accomplishments || "—"}</p>
                      {noteLine(entry)}
                    </td>
                    <td className="py-2 text-muted-foreground">{entry.toolsUsed ?? "—"}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="weekly-report-form" className="space-y-4">
      {/* The week at a glance: select a day to open it, a day off to add it as overtime. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {readyCount} of {entries.length} days ready
          </p>
          <TotalsBar totals={totals} />
        </div>
        <WeekTimetable
          cells={cells}
          label="This week: select a day to open it"
          legend={["done", "todo", "absent", "off"]}
        />
      </div>

      <div className="space-y-2">
        {days.map((day) => {
          if (!day.entry) return offDayLine(day, true);
          const entry = day.entry;
          const row = rowOf(entry);
          const flag = copyPasteFlags[entry.id];
          const problem = problems[entry.id];
          const ready = !problemOf(entry);
          const exceptions = exceptionsOf(entry, row, shift);
          const early = exceptions.some((x) => x.kind === "early");
          const overtime = exceptions.some((x) => x.kind === "overtime");
          const needsReason =
            (row.status === "ABSENT" || early) && row.reason.trim().length < DAY_NOTE_MIN;
          const dayLabel = formatDay(entry.reportDate);
          // Phones get the compact clock ("8a–12p"), so the summary line never cuts off.
          const shortTimes =
            row.status === "PRESENT" && valid(row.timeIn) && valid(row.timeOut)
              ? `${clockShort(row.timeIn)}–${clockShort(row.timeOut)}${row.split && valid(row.timeIn2) && valid(row.timeOut2) ? `, ${clockShort(row.timeIn2)}–${clockShort(row.timeOut2)}` : ""}`
              : null;
          const timesText =
            row.status === "PRESENT"
              ? valid(row.timeIn) && valid(row.timeOut)
                ? `${rangeText(row.timeIn, row.timeOut)}${row.split && valid(row.timeIn2) && valid(row.timeOut2) ? `, ${rangeText(row.timeIn2, row.timeOut2)}` : ""}`
                : "No times yet"
              : row.status === "HOLIDAY"
                ? holidayLabel(entry.reportDate)
                : "Absent";
          return (
            <details
              key={entry.id}
              id={`day-${entry.id}`}
              open={Boolean(open[entry.id])}
              onToggle={(e) => {
                const isOpen = e.currentTarget.open;
                if (isOpen !== Boolean(open[entry.id])) {
                  setOpen((prev) => ({ ...prev, [entry.id]: isOpen }));
                }
              }}
              className={cn(
                "group/day scroll-mt-6 rounded-lg border bg-card",
                flag && "border-amber-300",
                problem && "border-red-300"
              )}
            >
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="grid min-w-0 flex-1 grid-cols-1 gap-x-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-medium text-foreground">{dayLabel}</span>
                  <span className="truncate text-xs text-muted-foreground sm:text-sm">
                    {shortTimes ? (
                      <>
                        <span className="sm:hidden">{shortTimes}</span>
                        <span className="hidden sm:inline">{timesText}</span>
                      </>
                    ) : (
                      timesText
                    )}
                    {row.status === "PRESENT" && row.hours !== "" && (
                      <span className="text-foreground/80">
                        {" "}
                        · {formatHrsMins(Number(row.hours))}
                      </span>
                    )}
                    {overtime && <span className="text-foreground/80"> · overtime</span>}
                    {entry.scheduledHours === 0 && " · outside your schedule"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  {row.edited && row.dirty && (
                    <span className="hidden text-amber-700 sm:inline">Unsaved</span>
                  )}
                  {problem ? (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger-soft-foreground">
                      Fix
                    </span>
                  ) : needsReason ? (
                    <span className="rounded-full bg-notice px-2 py-0.5 font-medium text-notice-foreground">
                      Reason needed
                    </span>
                  ) : ready && overtime && !row.reason.trim() ? (
                    // Not a blocker: overtime without a reason simply isn't credited.
                    <span className="rounded-full bg-notice px-2 py-0.5 font-medium text-notice-foreground">
                      Say why for overtime
                    </span>
                  ) : ready ? (
                    <span className="flex items-center gap-1 rounded-full bg-status-done/15 px-2 py-0.5 font-medium text-foreground">
                      <Check className="size-3" aria-hidden="true" />
                      Ready
                    </span>
                  ) : (
                    <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                      To fill in
                    </span>
                  )}
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform duration-200 group-open/day:rotate-180"
                    aria-hidden="true"
                  />
                </span>
              </summary>

              <div className="space-y-4 border-t px-4 pt-3 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StatusChips
                    entryId={entry.id}
                    dayLabel={dayLabel}
                    value={row.status}
                    holiday={Boolean(holidayOn(entry.reportDate))}
                    disabled={isPending}
                    onChange={(s) => setStatus(entry, row, s)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {entry.scheduledHours > 0
                      ? `${formatHrsMins(entry.scheduledHours)} scheduled`
                      : "Not a scheduled day: counts as overtime"}
                  </span>
                </div>

                {row.status === "PRESENT" && (
                  <>
                    <div className="space-y-2">
                      <div className="grid max-w-md grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`in-${entry.id}`} className="text-xs">
                            Time in
                          </Label>
                          <Input
                            id={`in-${entry.id}`}
                            {...fieldProps(entry.id, "in")}
                            type="time"
                            value={row.timeIn}
                            disabled={isPending}
                            onChange={(e) =>
                              updateTimes(entry.id, { ...row, timeIn: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`out-${entry.id}`} className="text-xs">
                            Time out
                          </Label>
                          <Input
                            id={`out-${entry.id}`}
                            {...fieldProps(entry.id, "out")}
                            type="time"
                            value={row.timeOut}
                            disabled={isPending}
                            onChange={(e) =>
                              updateTimes(entry.id, { ...row, timeOut: e.target.value })
                            }
                          />
                        </div>
                        {row.split && (
                          <>
                            <div className="space-y-1">
                              <Label htmlFor={`in2-${entry.id}`} className="text-xs">
                                Back in
                              </Label>
                              <Input
                                id={`in2-${entry.id}`}
                                {...fieldProps(entry.id, "in2")}
                                type="time"
                                value={row.timeIn2}
                                disabled={isPending}
                                onChange={(e) =>
                                  updateTimes(entry.id, { ...row, timeIn2: e.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`out2-${entry.id}`} className="text-xs">
                                Out again
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
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <output
                          htmlFor={`in-${entry.id} out-${entry.id}`}
                          className="text-muted-foreground"
                        >
                          {row.hours !== ""
                            ? `${formatHrsMins(Number(row.hours))} at work`
                            : "Hours fill in from your times"}
                        </output>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            updateTimes(
                              entry.id,
                              row.split
                                ? { ...row, split: false, timeIn2: "", timeOut2: "" }
                                : { ...row, split: true }
                            )
                          }
                          className="inline-flex min-h-6 cursor-pointer items-center gap-1 text-primary underline-offset-4 hover:underline"
                        >
                          {row.split ? (
                            <>
                              <X className="size-3" aria-hidden="true" /> Remove second range
                            </>
                          ) : (
                            <>
                              <Plus className="size-3" aria-hidden="true" /> Left and came back? Add
                              a second time range
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {exceptions.length > 0 && (
                      <div
                        role="group"
                        aria-labelledby={`why-${entry.id}`}
                        className="space-y-2 rounded-md border border-notice-border bg-notice p-3"
                      >
                        <p
                          id={`why-${entry.id}`}
                          className="text-sm font-medium text-notice-foreground"
                        >
                          {exceptions.map(exceptionText).join(" · ")}
                        </p>
                        <Label
                          htmlFor={`reason-${entry.id}`}
                          className="text-xs text-notice-foreground"
                        >
                          {early
                            ? "Why did you leave early? (required)"
                            : overtime
                              ? "What was the overtime for?"
                              : "What happened? (optional)"}
                        </Label>
                        <Textarea
                          id={`reason-${entry.id}`}
                          {...fieldProps(entry.id, "reason")}
                          rows={2}
                          value={row.reason}
                          maxLength={500}
                          disabled={isPending}
                          onChange={(e) => updateRow(entry.id, { reason: e.target.value })}
                          placeholder={
                            overtime
                              ? "e.g. Stayed to finish the client deployment"
                              : "e.g. Dentist appointment, told my supervisor in advance"
                          }
                          className="bg-background"
                        />
                        <p className="text-xs text-notice-foreground/90">
                          {overtime && !row.reason.trim()
                            ? "Say what the overtime was for: it counts once your adviser accepts it. Under 30 minutes isn't credited."
                            : "Your adviser decides whether it counts; your supervisor signs it with the weekly report."}
                        </p>
                        <Decisions note={noteOf(entry)} dayLabel={dayLabel} reviewable={false} />
                      </div>
                    )}

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                      <div className="space-y-1">
                        <Label htmlFor={`acc-${entry.id}`} className="text-xs">
                          What you did
                        </Label>
                        <Textarea
                          id={`acc-${entry.id}`}
                          {...fieldProps(entry.id, "acc")}
                          rows={3}
                          value={row.accomplishments}
                          maxLength={5000}
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
                          maxLength={500}
                          disabled={isPending}
                          onChange={(e) => updateRow(entry.id, { toolsUsed: e.target.value })}
                          onBlur={() => carryToolsForward(entry.id)}
                          placeholder="e.g. VS Code, Figma"
                        />
                      </div>
                    </div>
                  </>
                )}

                {row.status === "ABSENT" && (
                  <div
                    role="group"
                    aria-labelledby={`why-${entry.id}`}
                    className="space-y-3 rounded-md border bg-muted/30 p-3"
                  >
                    <p id={`why-${entry.id}`} className="text-sm font-medium text-foreground">
                      Absent: counts 0 hours
                    </p>
                    <div className="space-y-1">
                      <Label htmlFor={`reason-${entry.id}`} className="text-xs">
                        Why were you absent?
                      </Label>
                      <Textarea
                        id={`reason-${entry.id}`}
                        {...fieldProps(entry.id, "reason")}
                        rows={2}
                        value={row.reason}
                        maxLength={500}
                        disabled={isPending}
                        onChange={(e) => updateRow(entry.id, { reason: e.target.value })}
                        placeholder="e.g. Fever, saw a doctor; told my supervisor that morning"
                        className="bg-background"
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`proof-${entry.id}`} className="text-xs">
                          Proof you&apos;ll upload to Google Classroom
                        </Label>
                        <select
                          id={`proof-${entry.id}`}
                          {...fieldProps(entry.id, "proof")}
                          value={row.proofType}
                          disabled={isPending}
                          onChange={(e) => updateRow(entry.id, { proofType: e.target.value })}
                          className="flex h-9 w-64 max-w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed"
                        >
                          <option value="">Choose…</option>
                          {Object.entries(PROOF_LABEL).map(([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <fieldset className="space-y-1">
                        <legend className="text-xs font-medium">Was it planned?</legend>
                        <div className="flex gap-2">
                          {(
                            [
                              ["ANTICIPATED", "Planned ahead"],
                              ["EMERGENCY", "Emergency"],
                            ] as const
                          ).map(([kind, label]) => (
                            <label
                              key={kind}
                              className={cn(
                                "flex h-9 cursor-pointer items-center rounded-full border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                                row.requestKind === kind
                                  ? "border-primary bg-primary/10 font-medium"
                                  : "border-input bg-background text-muted-foreground"
                              )}
                            >
                              <input
                                type="radio"
                                name={`kind-${entry.id}`}
                                value={kind}
                                checked={row.requestKind === kind}
                                disabled={isPending}
                                onChange={() => updateRow(entry.id, { requestKind: kind })}
                                className="sr-only"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your adviser decides whether it is excused. After you submit, your supervisor
                      signs the absence report together with the weekly report.
                    </p>
                    <Decisions note={noteOf(entry)} dayLabel={dayLabel} reviewable={false} />
                  </div>
                )}

                {row.status === "HOLIDAY" && (
                  <p className="text-sm text-muted-foreground">
                    {holidayLabel(entry.reportDate)}: counts 0 hours, nothing to write.
                  </p>
                )}

                {entry.scheduledHours === 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => removeAddedDay(entry)}
                    aria-label={`Remove ${dayLabel} from this report`}
                    className="h-8 cursor-pointer px-2 text-xs text-red-700"
                  >
                    {removeArmed === entry.id
                      ? "Click again to remove (with its text)"
                      : "Remove this day"}
                  </Button>
                )}

                {problem && (
                  <p
                    id={`problem-${entry.id}`}
                    className="flex items-center gap-1.5 text-xs text-red-700"
                  >
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    {problem.message}
                  </p>
                )}
                {flag && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    {flag} — please describe this day&apos;s work in your own words.
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <details
        open={addOpen}
        onToggle={(e) => {
          if (e.currentTarget.open !== addOpen) setAddOpen(e.currentTarget.open);
        }}
        className="text-sm"
      >
        <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
          <Plus className="size-3.5" aria-hidden="true" />
          Worked on Saturday or Sunday?
        </summary>
        <AddDayControl
          weeklyReportId={weeklyReportId}
          weekEnd={weekEndDate}
          takenDates={entries.map((e) => e.reportDate.slice(0, 10))}
          disabled={isPending}
          date={addDate}
          onDate={setAddDate}
          onAdded={() => router.refresh()}
        />
      </details>

      {late && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
          <Label htmlFor={`delay-${weeklyReportId}`} className="text-red-700 dark:text-red-300">
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
          <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
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

      {/* On a phone the actions stay in reach at the bottom of the screen. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-card/95 px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
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
          className="flex-1 cursor-pointer gap-1.5 disabled:cursor-not-allowed sm:flex-none"
        >
          <Send className="size-3.5" aria-hidden="true" />
          {isPending ? "Submitting..." : "Submit and generate PDF"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Next: download the PDF, have your HTE supervisor sign it and upload it to Google Classroom.
      </p>
    </div>
  );
}
