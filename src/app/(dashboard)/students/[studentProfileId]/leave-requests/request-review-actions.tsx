"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Workstream L1 — adviser review: Approve, or Return with an inline required
// note (no window.confirm). `label` names the request ("Overtime on Oct 10")
// so each button's accessible name says which request it acts on.
export function RequestReviewActions({
  requestId,
  label,
  canApprove,
}: {
  requestId: string;
  label: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (returning) noteRef.current?.focus();
  }, [returning]);

  async function review(action: "APPROVE" | "RETURN") {
    if (action === "RETURN" && !note.trim()) {
      toast.error("Add a note telling the student what to fix");
      noteRef.current?.focus();
      return;
    }
    setPending(true);
    const res = await fetch(`/api/time-requests/${requestId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "RETURN" ? { action, note: note.trim() } : { action }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.issues?.[0]?.message ?? body.error ?? "Review failed");
      return;
    }
    toast.success(action === "APPROVE" ? "Request approved" : "Request returned to the student");
    setReturning(false);
    setNote("");
    router.refresh();
  }

  if (returning) {
    return (
      <div className="w-full space-y-2">
        <Label htmlFor={`note-${requestId}`}>Note for the student ({label})</Label>
        <Textarea
          id={`note-${requestId}`}
          ref={noteRef}
          rows={2}
          maxLength={500}
          value={note}
          disabled={pending}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What should the student fix before resubmitting?"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => review("RETURN")}
            aria-label={`Return ${label} with this note`}
            className="cursor-pointer"
          >
            {pending ? "Returning..." : "Return with note"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setReturning(false)}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {canApprove && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => review("APPROVE")}
          aria-label={`Approve ${label}`}
          className="cursor-pointer gap-1.5"
        >
          <Check className="size-3.5" aria-hidden="true" />
          Approve
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setReturning(true)}
        aria-label={`Return ${label}`}
        className="cursor-pointer gap-1.5"
      >
        <Undo2 className="size-3.5" aria-hidden="true" />
        Return
      </Button>
    </div>
  );
}
