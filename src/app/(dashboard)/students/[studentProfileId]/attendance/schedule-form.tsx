"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCog, Clock3, Hourglass, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { formatSchedule, WEEKDAY_SHORT, type ScheduleConfig } from "@/lib/utils/schedule";
import { parseHHMM } from "@/lib/utils/timeMath";

// FR-AT-01, FR-AT-08 — Owner: gu457 (Ulrich)
// Requirement: initial schedule config form, plus a mid-internship
// change-request form (same component, two modes).
// Connects to: POST /api/students/[studentProfileId]/schedule (Task 9
// route) → `attendanceService.configureWorkSchedule` (Task 3) for initial
// setup; PATCH same route → `requestScheduleChange` (Task 3) for a change
// request, body validated by `scheduleChangeRequestSchema`
// (`src/lib/validators/attendance.ts`, Task 2) — needs `reason` (string)
// and `newScheduleConfig` (`{ daysOfWeek, hoursPerDay, startTime?, endTime?, breakMinutes? }`),
// plus an optional file upload for the supporting document.
// Follow the Phase 2 `checklist-item-row.tsx` pattern exactly (fetch +
// `sonner` toast + `router.refresh()`) — that file is the reference
// implementation for this kind of client component in this codebase.
// Edge cases: none beyond standard form validation.

export interface PendingScheduleChange {
  status: string;
  requestedAt: string;
  reason: string;
  newScheduleConfig: ScheduleConfig;
}

const PENDING_LABEL: Record<string, string> = {
  PENDING_FACULTY: "Awaiting faculty adviser",
  PENDING_COORDINATOR: "Awaiting department coordinator",
};

// Spec answer 1: per-student shift, defaulting to 08:00–17:00 with a 1 h break.
const DEFAULT_SHIFT = { startTime: "08:00", endTime: "17:00", breakMinutes: 60 };
const DEFAULT_SCHEDULE: ScheduleConfig = {
  daysOfWeek: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  ...DEFAULT_SHIFT,
};

// A legacy schedule without times starts its change form on the default shift.
const withShift = (s: ScheduleConfig): ScheduleConfig =>
  s.startTime ? s : { ...s, ...DEFAULT_SHIFT };

function DayPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled?: boolean;
}) {
  function toggle(day: number) {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day]);
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
      {WEEKDAY_SHORT.map((label, day) => {
        const selected = value.includes(day);
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => toggle(day)}
            className={cn(
              "h-9 min-w-[3rem] cursor-pointer rounded-md border px-3 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:bg-accent"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ScheduleFields({
  idPrefix,
  schedule,
  onChange,
  disabled,
}: {
  idPrefix: string;
  schedule: ScheduleConfig;
  onChange: (schedule: ScheduleConfig) => void;
  disabled?: boolean;
}) {
  // Changing the shift refills hours per day; the student can still edit it.
  function setShift(patch: Partial<ScheduleConfig>) {
    const next = { ...schedule, ...patch };
    const hours = shiftHours(next);
    onChange(hours != null && hours > 0 ? { ...next, hoursPerDay: hours } : next);
  }
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Working days</Label>
        <DayPicker
          value={schedule.daysOfWeek}
          onChange={(daysOfWeek) => onChange({ ...schedule, daysOfWeek })}
          disabled={disabled}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-start`}>Start time</Label>
          <Input
            id={`${idPrefix}-start`}
            type="time"
            value={schedule.startTime ?? ""}
            disabled={disabled}
            onChange={(e) => setShift({ startTime: e.target.value })}
            className="w-32"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-end`}>End time</Label>
          <Input
            id={`${idPrefix}-end`}
            type="time"
            value={schedule.endTime ?? ""}
            disabled={disabled}
            onChange={(e) => setShift({ endTime: e.target.value })}
            className="w-32"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-break`}>Break (minutes)</Label>
          <Input
            id={`${idPrefix}-break`}
            type="number"
            min={0}
            max={240}
            step={5}
            value={schedule.breakMinutes ?? 0}
            disabled={disabled}
            onChange={(e) => setShift({ breakMinutes: Number(e.target.value) })}
            className="w-28"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-hours`}>Hours per day</Label>
          <Input
            id={`${idPrefix}-hours`}
            type="number"
            min={1}
            max={24}
            step={0.5}
            value={schedule.hoursPerDay}
            disabled={disabled}
            onChange={(e) => onChange({ ...schedule, hoursPerDay: Number(e.target.value) })}
            className="w-28"
          />
        </div>
      </div>
    </div>
  );
}

function shiftHours(s: ScheduleConfig): number | null {
  if (!s.startTime || !s.endTime) return null;
  return (parseHHMM(s.endTime) - parseHHMM(s.startTime) - (s.breakMinutes ?? 0)) / 60;
}

function validateSchedule(schedule: ScheduleConfig): string | null {
  if (schedule.daysOfWeek.length === 0) return "Select at least one working day";
  if (!(schedule.hoursPerDay > 0 && schedule.hoursPerDay <= 24)) {
    return "Hours per day must be between 1 and 24";
  }
  if (!schedule.startTime !== !schedule.endTime) return "Give both a start and an end time";
  if (
    schedule.startTime &&
    schedule.endTime &&
    parseHHMM(schedule.endTime) <= parseHHMM(schedule.startTime)
  ) {
    return "End time must be after start time";
  }
  return null;
}

function appendShift(formData: FormData, schedule: ScheduleConfig) {
  if (schedule.startTime) formData.set("startTime", schedule.startTime);
  if (schedule.endTime) formData.set("endTime", schedule.endTime);
  if (schedule.breakMinutes != null) formData.set("breakMinutes", String(schedule.breakMinutes));
}

export function AttendanceScheduleForm({
  studentProfileId,
  workPlanApproved,
  currentSchedule,
  pendingChange,
  canEdit,
}: {
  studentProfileId: string;
  workPlanApproved: boolean;
  currentSchedule: ScheduleConfig | null;
  pendingChange: PendingScheduleChange | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [schedule, setSchedule] = useState<ScheduleConfig>(
    currentSchedule ? withShift(currentSchedule) : DEFAULT_SCHEDULE
  );
  const [reason, setReason] = useState("");
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [isPending, setIsPending] = useState(false);

  if (!workPlanApproved) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        <Hourglass className="size-6" aria-hidden="true" />
        <p>The work schedule can be set once the work plan is approved.</p>
      </div>
    );
  }

  async function submitInitialSchedule(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateSchedule(schedule);
    if (problem) {
      toast.error(problem);
      return;
    }
    setIsPending(true);
    const res = await fetch(`/api/students/${studentProfileId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule),
    });
    setIsPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to save schedule");
      return;
    }
    toast.success("Work schedule saved");
    router.refresh();
  }

  async function submitChangeRequest(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateSchedule(schedule);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required for a schedule change");
      return;
    }

    const formData = new FormData();
    formData.set("reason", reason.trim());
    formData.set("daysOfWeek", schedule.daysOfWeek.join(","));
    formData.set("hoursPerDay", String(schedule.hoursPerDay));
    appendShift(formData, schedule);
    const file = fileInputRef.current?.files?.[0];
    if (file) formData.set("file", file);

    setIsPending(true);
    const res = await fetch(`/api/students/${studentProfileId}/schedule`, {
      method: "PATCH",
      body: formData,
    });
    setIsPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to submit change request");
      return;
    }
    toast.success("Schedule change requested — your faculty adviser will review it");
    setShowChangeForm(false);
    setReason("");
    router.refresh();
  }

  // ── Mode 1: no schedule yet → initial setup (FR-AT-01) ──
  if (!currentSchedule) {
    if (!canEdit) {
      return <p className="text-sm text-muted-foreground">No work schedule configured yet.</p>;
    }
    return (
      <form
        data-testid="attendance-schedule-form"
        className="space-y-4"
        onSubmit={submitInitialSchedule}
      >
        <p className="text-sm text-muted-foreground">
          Set the days and hours you report to your host company. Weekly report forms are generated
          from this schedule.
        </p>
        <ScheduleFields
          idPrefix="initial"
          schedule={schedule}
          onChange={setSchedule}
          disabled={isPending}
        />
        <Button
          type="submit"
          disabled={isPending}
          className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
        >
          <CalendarCog className="size-3.5" aria-hidden="true" />
          {isPending ? "Saving..." : "Save schedule"}
        </Button>
      </form>
    );
  }

  // ── Mode 2: schedule exists → show it, allow a change request (FR-AT-08) ──
  return (
    <div data-testid="attendance-schedule-form" className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
        <Clock3 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Current schedule</p>
          <p className="text-sm text-muted-foreground">{formatSchedule(currentSchedule)}</p>
        </div>
      </div>

      {pendingChange ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">Schedule change requested</p>
            <StatusBadge status="PENDING" />
            <span className="text-xs text-muted-foreground">
              {PENDING_LABEL[pendingChange.status] ?? pendingChange.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            New schedule: {formatSchedule(pendingChange.newScheduleConfig)}
          </p>
          <p className="text-sm text-muted-foreground">Reason: {pendingChange.reason}</p>
          <p className="text-xs text-muted-foreground">
            Requested {new Date(pendingChange.requestedAt).toLocaleString()}
          </p>
        </div>
      ) : (
        canEdit &&
        (showChangeForm ? (
          <form className="space-y-4 rounded-lg border p-4" onSubmit={submitChangeRequest}>
            <p className="text-sm text-muted-foreground">
              Changes need faculty adviser validation and coordinator approval. Once approved they
              apply from that day forward — hours already validated are not affected.
            </p>
            <ScheduleFields
              idPrefix="change"
              schedule={schedule}
              onChange={setSchedule}
              disabled={isPending}
            />
            <div className="space-y-2">
              <Label htmlFor="schedule-change-reason">Reason for change</Label>
              <Textarea
                id="schedule-change-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Company moved our team to a 4-day work week"
                rows={3}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-change-file" className="flex items-center gap-1.5">
                <Paperclip className="size-3.5" aria-hidden="true" />
                Supporting document (optional)
              </Label>
              <Input
                id="schedule-change-file"
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                disabled={isPending}
                className="cursor-pointer"
              />
              <p className="text-xs text-muted-foreground">PDF up to 5MB, or JPG/PNG up to 2MB.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={isPending}
                className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
              >
                <Send className="size-3.5" aria-hidden="true" />
                {isPending ? "Submitting..." : "Submit request"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setShowChangeForm(false);
                  setSchedule(withShift(currentSchedule));
                }}
                className="cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChangeForm(true)}
            className="cursor-pointer gap-1.5"
          >
            <CalendarCog className="size-3.5" aria-hidden="true" />
            Request a schedule change
          </Button>
        ))
      )}
    </div>
  );
}
