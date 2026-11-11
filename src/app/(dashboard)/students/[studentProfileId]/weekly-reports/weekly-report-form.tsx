"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ClarityCoach } from "@/components/ai/clarity-coach";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarPlus, Check, Eye, Plus, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { clock } from "@/lib/utils/schedule";
import { sendJson } from "@/lib/utils/sendJson";
import { reportDays, type ReportDay } from "@/lib/utils/reportWeek";
import { clearDraft, loadDraft, saveDraft } from "@/lib/utils/reportDraft";
import { detectCopyPasteWarning } from "./copy-paste-warning";
import { generatePdfInBackground } from "./report-pdf-actions";
import { RequestReviewActions } from "../leave-requests/request-review-actions";

// FR-WR-02, FR-WR-03: the intern's week, laid out like SLU's Weekly Work Report and using its
// labels (the faculty adviser, Nov 2026: "just stick with the report template"): one row per
// day with Date (Day), Actual Work Times (AM and PM Time In / Time Out), Hours Rendered and
// List of Work Accomplished (the adviser's label; the printed sheet says Work Accomplishment). Every scheduled day starts filled in from the schedule, so the intern
// writes the work accomplished and only explains a day that differs from the schedule.
// Overtime, under time and absences are reported on that day with remarks (no separate
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

// A day's clock times. As saved they are a first and an optional second range; in the form
// they are the template's two rows: timeIn/timeOut the morning (AM), timeIn2/timeOut2 the
// afternoon (PM). The intern's usual ones prefill days the schedule gives no times for.
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
  UNDERTIME: "Under time",
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

type Slots = Pick<RowState, "timeIn" | "timeOut" | "timeIn2" | "timeOut2">;

// The day's time ranges in order: the AM row, then the PM row, each only when complete.
function rangesOf(row: Slots): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (valid(row.timeIn) && valid(row.timeOut)) out.push([row.timeIn, row.timeOut]);
  if (valid(row.timeIn2) && valid(row.timeOut2)) out.push([row.timeIn2, row.timeOut2]);
  return out;
}

// A day saved as one range that starts at noon or later belongs in the PM row.
function toSlots(t: DayTimes): DayTimes {
  return !t.timeIn2 && !t.timeOut2 && valid(t.timeIn) && t.timeIn >= "12:00"
    ? { timeIn: "", timeOut: "", timeIn2: t.timeIn, timeOut2: t.timeOut }
    : t;
}

const NOON = 12 * 60;
// The schedule's shift as the template's two rows: the morning to 12:00, the afternoon from
// the end of the break (8:00 am - 5:00 pm with a 1-hour break: 8:00 - 12:00, 1:00 - 5:00).
function shiftSlots(shift: Shift): DayTimes {
  const { startMin, endMin, breakMinutes } = shift;
  if (startMin < NOON && endMin <= 24 * 60 && NOON + breakMinutes < endMin) {
    return {
      timeIn: toHHMM(startMin),
      timeOut: "12:00",
      timeIn2: toHHMM(NOON + breakMinutes),
      timeOut2: toHHMM(endMin),
    };
  }
  return toSlots({ timeIn: toHHMM(startMin), timeOut: toHHMM(endMin), timeIn2: "", timeOut2: "" });
}

// Hours follow the times (both rows); credited hours under SLU's rules come from the server.
function hoursOf(row: Slots): string {
  const [first, second] = rangesOf(row);
  const minutes = rangeMinutes({
    timeIn: first?.[0],
    timeOut: first?.[1],
    timeIn2: second?.[0],
    timeOut2: second?.[1],
  });
  return minutes > 0 ? String(Math.round((minutes / 60) * 100) / 100) : "";
}

// What makes this day differ from the schedule, read from its times (none unless Present).
function exceptionsOf(entry: DailyEntryRow, row: RowState, shift: Shift | null): DayException[] {
  const ranges = row.status === "PRESENT" ? rangesOf(row) : [];
  if (ranges.length === 0) return [];
  return dayExceptions(ranges, shift, entry.scheduledHours > 0, entry.scheduledHours).filter(
    (x) => x.minutes > 0
  );
}

// The PATCH body for one row; also what dayProblem validates.
function rowPayload(entry: DailyEntryRow, row: RowState, shift: Shift | null) {
  const present = row.status === "PRESENT";
  const reason = row.reason.trim();
  const [first, second] = present ? rangesOf(row) : [];
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
    timeIn: first?.[0],
    timeOut: first?.[1],
    timeIn2: second?.[0],
    timeOut2: second?.[1],
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
  // A row with only one of its two times can't be counted.
  if (Boolean(row.timeIn) !== Boolean(row.timeOut)) {
    return {
      message: "Enter both the AM Time In and Time Out",
      field: row.timeIn ? "out" : "in",
    };
  }
  if (Boolean(row.timeIn2) !== Boolean(row.timeOut2)) {
    return {
      message: "Enter both the PM Time In and Time Out",
      field: row.timeIn2 ? "out2" : "in2",
    };
  }
  if (rangesOf(row).length === 0) {
    return { message: "Enter your Time In and Time Out", field: "in" };
  }
  if (!row.accomplishments.trim()) {
    return { message: "List the work you accomplished this day", field: "acc" };
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
  // A day with only a PM row is saved as its first range: point at the PM inputs.
  const field = FIELD_IDS[key] ?? "acc";
  const pmOnly = !row.timeIn && (field === "in" || field === "out");
  return {
    message: issue?.message ?? "Check this day's entry",
    field: pmOnly ? `${field}2` : field,
  };
}

// "Jun 12 (Monday)", as SLU's template writes the Date (Day) column.
function templateDay(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${date} (${d.toLocaleDateString("en-PH", { weekday: "long", timeZone: "UTC" })})`;
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
  return span ? `Left early${span} (${length})` : `Under time: ${length} less than scheduled`;
}

function TotalsBar({ totals }: { totals: WeeklyTotals }) {
  // The totals under the template's Detailed Time Record, in its words.
  const beginning = Math.round((totals.runningTotal - totals.totalHours) * 100) / 100;
  const items = [
    ["Total work-hours rendered", formatHrsMins(totals.totalHours)],
    ["TOTAL work-hours (beginning)", formatHrsMins(beginning)],
    ["TOTAL rendered so far (ending)", formatHrsMins(totals.runningTotal)],
    ...(totals.conductDeductions > 0
      ? [["Less conduct deductions (to date)", `−${formatHrsMins(totals.conductDeductions)}`]]
      : []),
  ];
  return (
    <dl className="grid w-fit max-w-full grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm sm:ml-auto">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground sm:text-right">{label}</dt>
          <dd
            className={cn(
              "text-right font-semibold tabular-nums",
              label.startsWith("Less") ? "text-destructive" : "text-foreground"
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
    toast.success("Day added: fill in your times, work accomplished and overtime remarks");
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
    // The schedule's own day: its hours, since a one-range shift (afternoon, night) still has
    // its break inside it and the raw span would overstate the day.
    return { ...shiftSlots(shift), hours: String(shift.scheduledHours) };
  }
  const slots = usual ? toSlots(usual) : null;
  return slots ? { ...slots, hours: hoursOf(slots) } : {};
}

function rowFromEntry(
  e: DailyEntryRow,
  shift: Shift | null = null,
  usual: DayTimes | null = null,
  note: DayNoteRow | undefined = undefined
): RowState {
  // An unfilled scheduled day starts as Present at the schedule's times, else at the times
  // of the intern's last worked day (the adviser: fewer things to type).
  const unfilled = e.scheduledHours > 0 && e.actualHours == null && !e.timeIn;
  const base: RowState = {
    status: isAttendanceStatus(e.attendanceStatus) ? e.attendanceStatus : "PRESENT",
    hours: e.actualHours == null ? "" : String(e.actualHours),
    ...toSlots({
      timeIn: e.timeIn ?? "",
      timeOut: e.timeOut ?? "",
      timeIn2: e.timeIn2 ?? "",
      timeOut2: e.timeOut2 ?? "",
    }),
    accomplishments: e.accomplishments ?? "",
    toolsUsed: e.toolsUsed ?? "",
    reason: note?.reason ?? "",
    proofType: note?.proofType ?? "",
    requestKind: note?.requestKind === "ANTICIPATED" ? "ANTICIPATED" : "EMERGENCY",
    dirty: false,
  };
  if (!unfilled || base.status !== "PRESENT") return base;
  const times = defaultTimes(e, shift, usual);
  return Object.keys(times).length ? { ...base, ...times, dirty: true } : base; // Save sends them
}

// The template's four columns, side by side on a wide screen; stacked with their labels below it.
const ROW_GRID = "xl:grid xl:grid-cols-[11rem_17rem_6.5rem_minmax(0,1fr)] xl:gap-4 xl:space-y-0";
// A column's label: shown above its field when stacked, in the header row when side by side.
const COLUMN_LABEL = "text-xs font-medium text-muted-foreground xl:sr-only";

const TIME_ROWS = [
  { half: "AM", inId: "in", outId: "out", inKey: "timeIn", outKey: "timeOut" },
  { half: "PM", inId: "in2", outId: "out2", inKey: "timeIn2", outKey: "timeOut2" },
] as const;

export function WeeklyReportForm({
  weeklyReportId,
  entries,
  totals: initialTotals,
  editable,
  weekEnd,
  priorAccomplishments,
  shift = null,
  usualTimes = null,
  holidays = {},
  notes = {},
  clarityAi = false,
  reviewable = false,
  firstWeek = false,
  firstDay = null,
}: {
  weeklyReportId: string;
  entries: DailyEntryRow[];
  totals: WeeklyTotals;
  editable: boolean;
  weekEnd: string;
  priorAccomplishments: string[];
  shift?: Shift | null;
  usualTimes?: DayTimes | null;
  // This intern's applicable holidays by date (YYYY-MM-DD): PH holidays and company days off.
  holidays?: Record<string, { name: string; company: boolean }>;
  // Reasons already reported on this week's days, by date (YYYY-MM-DD).
  notes?: Record<string, DayNoteRow>;
  // AI assist's clarity coach can take a second look (lib/ai/jobs.ts "clarity" is on).
  clarityAi?: boolean;
  // The viewer is staff who can accept or not each reported reason (read-only views).
  reviewable?: boolean;
  // This is the intern's Week No. 1, where the first day of OJT is set.
  firstWeek?: boolean;
  // The intern's first day of OJT (ISO date), when set: earlier days are "not yet started".
  firstDay?: string | null;
}) {
  const router = useRouter();
  const holidayOn = (iso: string) => holidays[iso.slice(0, 10)];
  const holidayLabel = (iso: string) => {
    const h = holidayOn(iso);
    return h ? `Holiday (${h.company ? "Company" : "PH Calendar"}): ${h.name}` : "Holiday";
  };
  const noteOf = (e: DailyEntryRow) => notes[e.reportDate.slice(0, 10)];
  const fresh = (e: DailyEntryRow) => rowFromEntry(e, shift, usualTimes, noteOf(e));

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
    [entries, shift, usualTimes, notes]
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
  const [addDate, setAddDate] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // Ties an input to its day's error text so screen readers read it with the field.
  function fieldProps(entryId: string, field: string) {
    return problems[entryId]?.field === field
      ? { "aria-invalid": true, "aria-describedby": `problem-${entryId}` }
      : {};
  }

  function focusField(entryId: string, field: string) {
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
  function updateTime(id: string, row: RowState, key: keyof Slots, value: string) {
    const next = { ...row, [key]: value };
    updateRow(id, { [key]: value, hours: hoursOf(next) });
  }

  function setStatus(entry: DailyEntryRow, row: RowState, status: AttendanceStatus) {
    if (status === row.status) return;
    if (status === "PRESENT") {
      // Back to Present: start again from the schedule's times.
      const times = rangesOf(row).length ? {} : defaultTimes(entry, shift, usualTimes);
      updateRow(entry.id, { status, ...times });
      return;
    }
    updateRow(entry.id, { status, hours: "0", ...EMPTY_TIMES });
  }

  const rowOf = (entry: DailyEntryRow) => rows[entry.id] ?? fresh(entry);
  const problemOf = (entry: DailyEntryRow) => dayProblem(entry, rowOf(entry), shift);

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

  // The report's days: Monday to Friday always, Saturday/Sunday only when worked (SLU policy).
  const weekStart = addDays(weekEndDate, -6);
  const days = reportDays(weekStart, entries);

  // Week No. 1 only: an intern who started mid-week has earlier days that are neither a day
  // off nor an absence. They pick their first day; the server drops the days before it.
  const firstDayKey = firstWeek && firstDay ? firstDay.slice(0, 10) : "";
  const notStarted = (key: string) => key < firstDayKey;
  async function setFirstDay(key: string) {
    setIsPending(true);
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/first-day`, {
      method: "PUT",
      body: { firstDay: key },
    });
    setIsPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`First day of OJT set to ${formatDay(key)}`);
    router.refresh();
  }

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
    toast.success("Day added: fill in your times, work accomplished and overtime remarks");
    router.refresh();
  }

  // What a weekday without an entry is: before the first day of OJT, a holiday, or a day off.
  const offDayText = (key: string) => {
    const h = holidays[key];
    if (notStarted(key)) return "OJT not yet started";
    return h ? holidayLabel(key) : "Day off";
  };

  // A weekday with nothing worked: one quiet line.
  function offDayLine(day: ReportDay<DailyEntryRow>) {
    const label = formatDay(day.date.toISOString());
    return (
      <div
        key={day.key}
        className="flex min-h-12 flex-wrap items-center justify-between gap-2 bg-muted/20 px-4 py-2"
      >
        <span className="text-sm">
          <span className="font-medium text-foreground">{templateDay(day.date.toISOString())}</span>
          <span className="text-muted-foreground"> · {offDayText(day.key)}</span>
        </span>
        {!notStarted(day.key) && (
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

  if (entries.length === 0 && !firstWeek) {
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
          : exceptionsOf(entry, rowOf(entry), shift).map(exceptionText).join(" · ") || "Remarks";
      return (
        <div className="space-y-1.5 rounded-md bg-notice px-2 py-1.5 text-xs text-notice-foreground">
          <p>
            <span className="font-medium">{what}:</span> {note.reason}
          </p>
          <Decisions note={note} dayLabel={formatDay(entry.reportDate)} reviewable={reviewable} />
        </div>
      );
    };
    // The Actual Work Times column, as the template prints it.
    const workTimes = (entry: DailyEntryRow) => {
      if (entry.attendanceStatus === "HOLIDAY") return holidayLabel(entry.reportDate);
      if (entry.attendanceStatus === "ABSENT") return "Absent";
      if (!entry.timeIn || !entry.timeOut) {
        return STATUS_LABEL[entry.attendanceStatus] ?? entry.attendanceStatus;
      }
      return (
        <>
          {rangeText(entry.timeIn, entry.timeOut)}
          {entry.timeIn2 && entry.timeOut2 && (
            <>
              <br />
              {rangeText(entry.timeIn2, entry.timeOut2)}
            </>
          )}
        </>
      );
    };
    const hoursRendered = (entry: DailyEntryRow) =>
      entry.actualHours == null ? "—" : formatHrsMins(entry.actualHours);
    return (
      <div data-testid="weekly-report-form" className="space-y-3">
        {/* Phones: one stacked row per day, so the accomplishment text keeps the full width. */}
        <ul className="divide-y sm:hidden">
          {days.map(({ key, date, entry }) =>
            !entry ? (
              <li key={key} className="py-3 text-sm text-muted-foreground">
                {templateDay(date.toISOString())} · {offDayText(key)}
              </li>
            ) : (
              <li key={entry.id} className="space-y-1 py-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{templateDay(entry.reportDate)}</span>
                  <span className="whitespace-nowrap">{hoursRendered(entry)}</span>
                </p>
                <p className="text-xs text-muted-foreground">{workTimes(entry)}</p>
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
                <th className="py-2 pr-3 font-medium">Date (Day)</th>
                <th className="py-2 pr-3 font-medium">Actual Work Times</th>
                <th className="py-2 pr-3 font-medium">Hours Rendered</th>
                <th className="py-2 font-medium">List of Work Accomplished</th>
              </tr>
            </thead>
            <tbody>
              {days.map(({ key, date, entry }) =>
                !entry ? (
                  <tr key={key} className="border-b align-top text-muted-foreground last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {templateDay(date.toISOString())}
                    </td>
                    <td className="py-2 pr-3" colSpan={3}>
                      {offDayText(key)}
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="border-b align-top last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{templateDay(entry.reportDate)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                      {workTimes(entry)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{hoursRendered(entry)}</td>
                    <td className="space-y-1 py-2">
                      <p className="whitespace-pre-wrap">{entry.accomplishments || "—"}</p>
                      {entry.toolsUsed && (
                        <p className="text-xs text-muted-foreground">Tools: {entry.toolsUsed}</p>
                      )}
                      {noteLine(entry)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        <TotalsBar totals={totals} />
      </div>
    );
  }

  return (
    <div data-testid="weekly-report-form" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Detailed Time Record</p>
        <p className="text-xs text-muted-foreground">
          {readyCount} of {entries.length} days ready
        </p>
      </div>

      {firstWeek && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 px-3 py-2.5">
          <Label htmlFor={`first-day-${weeklyReportId}`} className="text-sm">
            First day of OJT
          </Label>
          <select
            id={`first-day-${weeklyReportId}`}
            value={firstDayKey || toDateKey(weekStart)}
            disabled={isPending}
            onChange={(e) => setFirstDay(e.target.value)}
            aria-describedby={`first-day-help-${weeklyReportId}`}
            className="flex h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed"
          >
            {Array.from({ length: 7 }, (_, i) => toDateKey(addDays(weekStart, i))).map((key) => (
              <option key={key} value={key}>
                {templateDay(key)}
              </option>
            ))}
          </select>
          <p id={`first-day-help-${weeklyReportId}`} className="text-xs text-muted-foreground">
            This is your Week No. 1. If you started in the middle of the week, pick the day: the
            days before it are not counted as absences.
          </p>
        </div>
      )}

      <div className="divide-y rounded-lg border bg-card">
        <div
          aria-hidden="true"
          className={cn(
            "hidden bg-muted/40 px-4 py-2 text-center text-xs font-semibold text-foreground",
            ROW_GRID
          )}
        >
          <span>Date (Day)</span>
          <span>Actual Work Times</span>
          <span>Hours Rendered</span>
          <span>List of Work Accomplished</span>
        </div>
        {days.map((day) => {
          if (!day.entry) return offDayLine(day);
          const entry = day.entry;
          const row = rowOf(entry);
          const flag = copyPasteFlags[entry.id];
          const problem = problems[entry.id];
          const ready = !problemOf(entry);
          const exceptions = exceptionsOf(entry, row, shift);
          const early = exceptions.some((x) => x.kind === "early");
          const overtime = exceptions.some((x) => x.kind === "overtime");
          const underTime = exceptions.some((x) => x.kind !== "overtime");
          const needsReason =
            (row.status === "ABSENT" || early) && row.reason.trim().length < DAY_NOTE_MIN;
          const dayLabel = formatDay(entry.reportDate);
          return (
            <section
              key={entry.id}
              id={`day-${entry.id}`}
              aria-label={dayLabel}
              className={cn(
                "scroll-mt-6 space-y-3 border-l-4 border-l-transparent px-3 py-4 sm:px-4",
                ROW_GRID,
                flag && "border-l-amber-400",
                problem && "border-l-red-400"
              )}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {templateDay(entry.reportDate)}
                  </p>
                  <span className="flex items-center gap-2 text-xs">
                    {row.edited && row.dirty && <span className="text-amber-700">Unsaved</span>}
                    {problem ? (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger-soft-foreground">
                        Fix
                      </span>
                    ) : needsReason ? (
                      <span className="rounded-full bg-notice px-2 py-0.5 font-medium text-notice-foreground">
                        Remarks needed
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
                  </span>
                </div>
                <StatusChips
                  entryId={entry.id}
                  dayLabel={dayLabel}
                  value={row.status}
                  holiday={Boolean(holidayOn(entry.reportDate))}
                  disabled={isPending}
                  onChange={(s) => setStatus(entry, row, s)}
                />
                {entry.scheduledHours === 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Not a scheduled day: counts as overtime
                    </p>
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
                  </div>
                )}
              </div>

              {row.status === "PRESENT" ? (
                <fieldset className="min-w-0">
                  <legend className={cn(COLUMN_LABEL, "mb-1")}>Actual Work Times</legend>
                  <div className="grid max-w-xs grid-cols-2 items-center gap-x-2 gap-y-1.5 sm:grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)]">
                    <span className="hidden sm:block" />
                    <span className="text-xs text-muted-foreground">Time In</span>
                    <span className="text-xs text-muted-foreground">Time Out</span>
                    {TIME_ROWS.map((t) => (
                      <div key={t.half} className="contents">
                        <span className="col-span-2 text-xs font-semibold text-foreground sm:col-span-1">
                          {t.half}
                        </span>
                        <Input
                          id={`${t.inId}-${entry.id}`}
                          {...fieldProps(entry.id, t.inId)}
                          aria-label={`${t.half} Time In`}
                          type="time"
                          className="min-w-0 px-2"
                          value={row[t.inKey]}
                          disabled={isPending}
                          onChange={(e) => updateTime(entry.id, row, t.inKey, e.target.value)}
                        />
                        <Input
                          id={`${t.outId}-${entry.id}`}
                          {...fieldProps(entry.id, t.outId)}
                          aria-label={`${t.half} Time Out`}
                          type="time"
                          className="min-w-0 px-2"
                          value={row[t.outKey]}
                          disabled={isPending}
                          onChange={(e) => updateTime(entry.id, row, t.outKey, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p className="text-sm font-medium text-foreground">
                  {row.status === "HOLIDAY" ? holidayLabel(entry.reportDate) : "Absent"}
                </p>
              )}

              <p className="flex items-baseline gap-2 xl:block xl:text-center">
                <span className={COLUMN_LABEL}>Hours Rendered</span>
                <output
                  htmlFor={TIME_ROWS.map(
                    (t) => `${t.inId}-${entry.id} ${t.outId}-${entry.id}`
                  ).join(" ")}
                  className="text-sm font-semibold text-foreground tabular-nums"
                >
                  {row.status !== "PRESENT"
                    ? "0"
                    : row.hours !== ""
                      ? formatHrsMins(Number(row.hours))
                      : "—"}
                </output>
              </p>

              <div className="min-w-0 space-y-3">
                {row.status === "PRESENT" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor={`acc-${entry.id}`} className={COLUMN_LABEL}>
                        List of Work Accomplished
                      </Label>
                      <Textarea
                        id={`acc-${entry.id}`}
                        {...fieldProps(entry.id, "acc")}
                        rows={3}
                        value={row.accomplishments}
                        maxLength={5000}
                        disabled={isPending}
                        onChange={(e) => updateRow(entry.id, { accomplishments: e.target.value })}
                        placeholder="List the work you accomplished this day"
                      />
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
                          {overtime && underTime
                            ? "Report on Overtime and UNDER TIME Hours"
                            : overtime
                              ? "Report on Overtime Hours"
                              : "Report on UNDER TIME Hours"}
                        </p>
                        <p className="text-xs text-notice-foreground">
                          {exceptions.map(exceptionText).join(" · ")}
                        </p>
                        <Label
                          htmlFor={`reason-${entry.id}`}
                          className="text-xs text-notice-foreground"
                        >
                          {early
                            ? "Remarks: reason for the under time (required)"
                            : overtime
                              ? "Remarks: reason for the off-duty work"
                              : "Remarks (optional)"}
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
                            ? "Overtime counts once your adviser accepts the remarks. Under 30 minutes isn't credited."
                            : "Your adviser decides whether it counts."}
                        </p>
                        <Decisions note={noteOf(entry)} dayLabel={dayLabel} reviewable={false} />
                      </div>
                    )}
                  </>
                )}

                {row.status === "ABSENT" && (
                  <div
                    role="group"
                    aria-label={`Absence on ${dayLabel}`}
                    className="space-y-3 rounded-md border bg-muted/30 p-3"
                  >
                    {(() => {
                      // A second day away: one tap fills this day from the earlier one (never
                      // the other way round; each day stays its own).
                      const earlier = entries
                        .slice(0, entries.indexOf(entry))
                        .findLast(
                          (e) => rows[e.id]?.status === "ABSENT" && rows[e.id]?.reason.trim()
                        );
                      if (!earlier || row.reason.trim()) return null;
                      const from = rowOf(earlier);
                      return (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            updateRow(entry.id, {
                              reason: from.reason,
                              proofType: from.proofType,
                              requestKind: from.requestKind,
                            })
                          }
                          className="h-8 cursor-pointer text-xs"
                        >
                          Same reason and proof as {formatDay(earlier.reportDate)}
                        </Button>
                      );
                    })()}
                    <div className="space-y-1">
                      <Label htmlFor={`reason-${entry.id}`} className="text-xs">
                        Reason for the absence
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
                      Your adviser decides whether it is excused. It prints with this weekly report
                      for your supervisor to sign.
                    </p>
                    <Decisions note={noteOf(entry)} dayLabel={dayLabel} reviewable={false} />
                  </div>
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
            </section>
          );
        })}
      </div>

      <TotalsBar totals={totals} />

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
