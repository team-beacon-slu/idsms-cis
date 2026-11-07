"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Workstream L1 — the intern files (or edits / resubmits) a leave, overtime
// or undertime request. JSON only: proof goes to Google Classroom (D2/D7).

export interface RequestFormValues {
  deviationType: string;
  requestKind: string;
  date: string; // YYYY-MM-DD
  endDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  proofType: string;
}

const EMPTY: RequestFormValues = {
  deviationType: "ABSENCE",
  requestKind: "ANTICIPATED",
  date: "",
  endDate: "",
  startTime: "",
  endTime: "",
  reason: "",
  proofType: "",
};

// "No duty" (the company had no work, or its own day off) files as an absence the adviser
// excuses, so the day isn't deducted. The prefix lets the absence report name it.
export const NO_DUTY_PREFIX = "No duty: ";

const SELECT_CLASS =
  "flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm disabled:cursor-not-allowed";

// Efficiency item 25: a request for today or a past day can't have been filed ahead, so the
// kind follows the date (Manila calendar). The intern can still change it.
export function kindForDate(date: string, now = new Date()): "ANTICIPATED" | "EMERGENCY" {
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return date && date <= today ? "EMERGENCY" : "ANTICIPATED";
}

export function toBody(v: RequestFormValues) {
  const noDuty = v.deviationType === "NO_DUTY";
  const isLeave = v.deviationType === "ABSENCE" || noDuty;
  return {
    deviationType: noDuty ? "ABSENCE" : v.deviationType,
    requestKind: v.requestKind,
    date: v.date,
    endDate: isLeave && v.endDate && !v.startTime ? v.endDate : undefined,
    startTime: v.startTime || undefined,
    endTime: v.endTime || undefined,
    reason: noDuty && !v.reason.startsWith(NO_DUTY_PREFIX) ? NO_DUTY_PREFIX + v.reason : v.reason,
    proofType: noDuty ? "WRITTEN_NOTICE" : isLeave ? v.proofType || undefined : undefined,
  };
}

export function RequestForm({
  studentProfileId,
  requestId,
  initial,
  onDone,
  returnTo,
}: {
  studentProfileId: string;
  requestId?: string; // set when editing
  initial?: Partial<RequestFormValues>;
  onDone?: () => void;
  returnTo?: string; // an internal path (already checked), e.g. the weekly report that linked here
}) {
  const router = useRouter();
  const [v, setV] = useState<RequestFormValues>(() => {
    const start = { ...EMPTY, ...initial };
    if (initial?.date && !initial.requestKind) start.requestKind = kindForDate(initial.date);
    // Editing a no-duty request shows it as one again, without the stored prefix.
    return start.deviationType === "ABSENCE" && start.reason.startsWith(NO_DUTY_PREFIX)
      ? { ...start, deviationType: "NO_DUTY", reason: start.reason.slice(NO_DUTY_PREFIX.length) }
      : start;
  });
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<RequestFormValues>) => setV((prev) => ({ ...prev, ...patch }));
  const noDuty = v.deviationType === "NO_DUTY";
  const isLeave = v.deviationType === "ABSENCE" || noDuty; // both take a date range
  const idp = requestId ?? "new";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendJson(
      requestId
        ? `/api/time-requests/${requestId}`
        : `/api/students/${studentProfileId}/time-requests`,
      { method: requestId ? "PATCH" : "POST", body: toBody(v) }
    );
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(requestId ? "Request resubmitted for review" : "Request sent to your adviser");
    if (!requestId) setV(EMPTY);
    onDone?.();
    if (returnTo) router.push(returnTo);
    else router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${idp}-type`}>Request</Label>
          <select
            id={`${idp}-type`}
            className={SELECT_CLASS}
            value={v.deviationType}
            disabled={pending}
            onChange={(e) => set({ deviationType: e.target.value })}
          >
            <option value="ABSENCE">Leave (absence)</option>
            <option value="NO_DUTY">No duty (no work / company day off)</option>
            <option value="OVERTIME">Overtime</option>
            <option value="UNDERTIME">Undertime (late / early leave)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idp}-kind`}>Kind</Label>
          <select
            id={`${idp}-kind`}
            className={SELECT_CLASS}
            value={v.requestKind}
            disabled={pending}
            onChange={(e) => set({ requestKind: e.target.value })}
          >
            <option value="ANTICIPATED">Anticipated (filed ahead)</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        </div>
        {noDuty && (
          <p className="self-end text-xs text-muted-foreground">
            Your adviser excuses these days, so no hours are deducted. Upload the company&apos;s
            notice in Google Classroom.
          </p>
        )}
        {isLeave && !noDuty && (
          <div className="space-y-1">
            <Label htmlFor={`${idp}-proof`}>Proof you will attach</Label>
            <select
              id={`${idp}-proof`}
              className={SELECT_CLASS}
              value={v.proofType}
              disabled={pending}
              onChange={(e) => set({ proofType: e.target.value })}
            >
              <option value="">Choose…</option>
              <option value="MEDICAL_CERTIFICATE">Medical certificate</option>
              <option value="PROOF_OF_LEAVE">Proof of leave</option>
              <option value="WRITTEN_NOTICE">Written notice</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Upload the attachment in Google Classroom.
            </p>
          </div>
        )}
      </div>

      {/* Same column rhythm as the selects above, so the fields line up. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`${idp}-date`}>{isLeave ? "From" : "Date"}</Label>
          <Input
            id={`${idp}-date`}
            type="date"
            required
            value={v.date}
            disabled={pending}
            onChange={(e) =>
              set(
                requestId
                  ? { date: e.target.value }
                  : { date: e.target.value, requestKind: kindForDate(e.target.value) }
              )
            }
          />
        </div>
        {isLeave && !v.startTime && (
          <div className="space-y-1">
            <Label htmlFor={`${idp}-end-date`}>To (optional, up to 14 days)</Label>
            <Input
              id={`${idp}-end-date`}
              type="date"
              min={v.date || undefined}
              value={v.endDate}
              disabled={pending}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor={`${idp}-start`}>
            {isLeave ? "From time (partial day)" : "Start time"}
          </Label>
          <Input
            id={`${idp}-start`}
            type="time"
            required={!isLeave}
            value={v.startTime}
            disabled={pending}
            onChange={(e) => set({ startTime: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idp}-end`}>{isLeave ? "To time" : "End time"}</Label>
          <Input
            id={`${idp}-end`}
            type="time"
            required={!isLeave || Boolean(v.startTime)}
            value={v.endTime}
            disabled={pending}
            onChange={(e) => set({ endTime: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${idp}-reason`}>Reason</Label>
        <Textarea
          id={`${idp}-reason`}
          rows={3}
          required
          minLength={10}
          maxLength={500}
          value={v.reason}
          disabled={pending}
          onChange={(e) => set({ reason: e.target.value })}
        />
      </div>

      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        {v.deviationType === "OVERTIME" && (
          <>
            <li>Overtime must be requested before it is worked.</li>
            <li>Overtime under 30 minutes is not credited.</li>
          </>
        )}
        <li>
          Attach the signed form and any proof to that week&apos;s report in Google Classroom.
        </li>
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
        >
          <Send className="size-3.5" aria-hidden="true" />
          {pending ? "Saving..." : requestId ? "Resubmit request" : "Send request"}
        </Button>
        {onDone && requestId && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onDone}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

// Inline "Edit" for a Pending or Returned request.
export function EditRequestButton({
  studentProfileId,
  requestId,
  initial,
  label,
}: {
  studentProfileId: string;
  requestId: string;
  initial: RequestFormValues;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${label}`}
        className="cursor-pointer gap-1.5"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </Button>
    );
  }
  return (
    <div className="mt-3 w-full rounded-lg border p-4">
      <RequestForm
        studentProfileId={studentProfileId}
        requestId={requestId}
        initial={initial}
        onDone={() => setOpen(false)}
      />
    </div>
  );
}
