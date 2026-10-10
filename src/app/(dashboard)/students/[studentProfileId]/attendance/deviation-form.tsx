"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// FR-AT-03 — Owner: gu457 (Ulrich)
// Requirement: date, reason category, supporting document upload for an
// absence/undertime/overtime deviation.
// Connects to: POST /api/students/[studentProfileId]/deviations (Task 10
// route) → `attendanceService.submitDeviationReport` (Task 3), body
// validated by `deviationReportSchema` (`src/lib/validators/attendance.ts`,
// Task 2) — needs `date`, `deviationType` (`DeviationType` enum:
// ABSENCE/OVERTIME/UNDERTIME), `reason`, optional `proofUrl`.
// Edge cases: none beyond standard form validation.
// Implementation: sent as multipart/form-data so the optional proof file
// travels with the report in one request; the route uploads it and stores
// the resulting Storage path as `proofUrl`.

const DEVIATION_TYPES = [
  { value: "ABSENCE", label: "Absence" },
  { value: "UNDERTIME", label: "Undertime" },
  { value: "OVERTIME", label: "Overtime" },
] as const;

const SELECT_CLASSES =
  "flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function DeviationReportForm({ studentProfileId }: { studentProfileId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(todayKey);
  const [deviationType, setDeviationType] = useState<string>("ABSENCE");
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      toast.error("Pick the date of the deviation");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required");
      return;
    }

    const formData = new FormData();
    formData.set("date", date);
    formData.set("deviationType", deviationType);
    formData.set("reason", reason.trim());
    const file = fileInputRef.current?.files?.[0];
    if (file) formData.set("file", file);

    setIsPending(true);
    const res = await fetch(`/api/students/${studentProfileId}/deviations`, {
      method: "POST",
      body: formData,
    });
    setIsPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to submit deviation report");
      return;
    }

    toast.success("Deviation report submitted for faculty validation");
    setReason("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <form data-testid="deviation-report-form" className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="deviation-date">Date</Label>
          <Input
            id="deviation-date"
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => setDate(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deviation-type">Type</Label>
          <select
            id="deviation-type"
            value={deviationType}
            onChange={(e) => setDeviationType(e.target.value)}
            disabled={isPending}
            className={SELECT_CLASSES}
          >
            {DEVIATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="deviation-reason">Reason</Label>
        <Textarea
          id="deviation-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Sick leave — medical certificate attached"
          rows={3}
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="deviation-proof" className="flex items-center gap-1.5">
          <Paperclip className="size-3.5" aria-hidden="true" />
          Proof document (optional)
        </Label>
        <Input
          id="deviation-proof"
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          disabled={isPending}
          className="cursor-pointer"
        />
        <p className="text-xs text-muted-foreground">PDF up to 5MB, or JPG/PNG up to 2MB.</p>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
      >
        <Send className="size-3.5" aria-hidden="true" />
        {isPending ? "Submitting..." : "Submit deviation report"}
      </Button>
    </form>
  );
}
