"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const ACTIONS = ["APPROVE", "RETURN", "REGARD", "DISREGARD"] as const;

const ACTION_PAST_TENSE: Record<(typeof ACTIONS)[number], string> = {
  APPROVE: "approved",
  RETURN: "returned",
  REGARD: "regarded",
  DISREGARD: "disregarded",
};

export function WeeklyReportReviewActions({ weeklyReportId }: { weeklyReportId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [notes, setNotes] = useState("");

  async function review(action: (typeof ACTIONS)[number]) {
    if (action === "RETURN" && notes.trim().length === 0) {
      toast.error("Notes are required when returning a report");
      return;
    }

    setIsPending(true);
    const res = await fetch(`/api/weekly-reports/${weeklyReportId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, notes: notes.trim() || undefined }),
    });
    setIsPending(false);

    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Review failed");
      return;
    }
    toast.success(`Report ${ACTION_PAST_TENSE[action]}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (required for Return)"
        disabled={isPending}
      />
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <Button
            key={action}
            size="sm"
            variant={action === "APPROVE" || action === "REGARD" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => review(action)}
          >
            {isPending ? "Saving..." : action}
          </Button>
        ))}
      </div>
    </div>
  );
}
