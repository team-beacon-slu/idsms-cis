"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ATTACHMENT_KEYS, ATTACHMENT_LABELS, sentence } from "@/lib/validators/finalReport";

// Workstream H (FR-FT-03) — the coordinator confirms each attachment in
// Google Classroom, then approves, or returns with a note.

export function FinalReportReview({
  reportId,
  attached,
}: {
  reportId: string;
  attached: Record<string, boolean>;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const allConfirmed = ATTACHMENT_KEYS.every((k) => confirmed[k]);

  async function review(action: "APPROVE" | "RETURN") {
    setPending(true);
    const res = await fetch(`/api/final-reports/${reportId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        note: action === "RETURN" ? note : undefined,
        confirmed: ATTACHMENT_KEYS.filter((k) => confirmed[k]),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      toast.error(b.issues?.[0]?.message ?? b.error ?? "Review failed");
      return;
    }
    toast.success(action === "APPROVE" ? "Final report approved" : "Final report returned");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Confirm in Google Classroom</legend>
        {ATTACHMENT_KEYS.map((k) => (
          <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!attached[k] || pending}
              checked={Boolean(confirmed[k])}
              onChange={(e) => setConfirmed({ ...confirmed, [k]: e.target.checked })}
            />
            {sentence(ATTACHMENT_LABELS[k])}
            {!attached[k] && (
              <span className="text-xs text-red-700 dark:text-red-400">(not marked attached)</span>
            )}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="fr-review-note">Note for the intern (required to return)</Label>
        <Textarea
          id="fr-review-note"
          rows={2}
          maxLength={1000}
          value={note}
          disabled={pending}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => review("APPROVE")}
          disabled={pending || !allConfirmed}
          title={allConfirmed ? undefined : "Confirm every attachment first"}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          Approve final report
        </Button>
        <Button
          variant="outline"
          onClick={() => review("RETURN")}
          disabled={pending}
          className="cursor-pointer"
        >
          Return with note
        </Button>
      </div>
    </div>
  );
}
