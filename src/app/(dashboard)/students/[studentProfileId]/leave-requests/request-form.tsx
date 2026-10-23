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

const SELECT_CLASS =
  "flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm disabled:cursor-not-allowed";

function toBody(v: RequestFormValues) {
  const isLeave = v.deviationType === "ABSENCE";
  return {
    deviationType: v.deviationType,
    requestKind: v.requestKind,
    date: v.date,
    endDate: isLeave && v.endDate && !v.startTime ? v.endDate : undefined,
    startTime: v.startTime || undefined,
    endTime: v.endTime || undefined,
    reason: v.reason,
    proofType: isLeave ? v.proofType || undefined : undefined,
  };
}

export function RequestForm({
  studentProfileId,
  requestId,
  initial,
  onDone,
}: {
  studentProfileId: string;
  requestId?: string; // set when editing
  initial?: Partial<RequestFormValues>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<RequestFormValues>({ ...EMPTY, ...initial });
  const [pending, setPending] = useState(false);
  const set = (patch: Partial<RequestFormValues>) => setV((prev) => ({ ...prev, ...patch }));
  const isLeave = v.deviationType === "ABSENCE";
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
    router.refresh();
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
        {isLeave && (
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
            onChange={(e) => set({ date: e.target.value })}
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
        <li>Overtime must be requested before it is worked.</li>
        <li>Overtime under 30 minutes is not credited.</li>
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
