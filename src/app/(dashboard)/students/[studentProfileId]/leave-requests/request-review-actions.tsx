"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Workstream L1 — adviser review: Approve, or Return with an inline required
// note (no window.confirm). `label` names the request ("Overtime on Oct 10")
// so each button's accessible name says which request it acts on.
// A reason from a weekly report reads as Accept / Not accepted (the adviser can change their
// mind later); a filed request keeps Approve / Return.
const WORDS = {
  request: {
    approve: "Approve",
    return: "Return",
    send: "Return with note",
    sending: "Returning...",
    ask: "What should the student fix before resubmitting?",
    done: ["Request approved", "Request returned to the student"],
  },
  reason: {
    approve: "Accept",
    return: "Not accepted",
    send: "Not accepted, with this note",
    sending: "Saving...",
    ask: "Why isn't it accepted? The intern sees this.",
    done: ["Accepted", "Marked not accepted; hours updated"],
  },
} as const;

export function RequestReviewActions({
  requestId,
  label,
  canApprove,
  canReturn = true,
  wording = "request",
}: {
  requestId: string;
  label: string;
  canApprove: boolean;
  canReturn?: boolean;
  wording?: keyof typeof WORDS;
}) {
  const w = WORDS[wording];
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
    const res = await sendJson(`/api/time-requests/${requestId}/review`, {
      method: "POST",
      body: action === "RETURN" ? { action, note: note.trim() } : { action },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(action === "APPROVE" ? w.done[0] : w.done[1]);
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
          placeholder={w.ask}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => review("RETURN")}
            aria-label={`${w.return}: ${label}, with this note`}
            className="cursor-pointer"
          >
            {pending ? w.sending : w.send}
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
          aria-label={`${w.approve}: ${label}`}
          className="cursor-pointer gap-1.5"
        >
          <Check className="size-3.5" aria-hidden="true" />
          {w.approve}
        </Button>
      )}
      {canReturn && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => setReturning(true)}
          aria-label={`${w.return}: ${label}`}
          className="cursor-pointer gap-1.5"
        >
          <Undo2 className="size-3.5" aria-hidden="true" />
          {w.return}
        </Button>
      )}
    </div>
  );
}
