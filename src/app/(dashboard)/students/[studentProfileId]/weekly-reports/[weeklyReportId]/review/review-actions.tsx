"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, EyeOff, RotateCcw, ThumbsUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = ["APPROVE", "RETURN", "REGARD", "DISREGARD"] as const;

const ACTION_PAST_TENSE: Record<(typeof ACTIONS)[number], string> = {
  APPROVE: "approved",
  RETURN: "returned",
  REGARD: "regarded",
  DISREGARD: "disregarded",
};

const ACTION_ICON: Record<(typeof ACTIONS)[number], LucideIcon> = {
  APPROVE: Check,
  RETURN: RotateCcw,
  REGARD: ThumbsUp,
  DISREGARD: EyeOff,
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
      <div className="space-y-1.5">
        <Label htmlFor="review-notes" className="text-sm text-muted-foreground">
          Notes (required for Return)
        </Label>
        <Textarea
          id="review-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add context for the student, e.g. what needs to be revised…"
          disabled={isPending}
          className="transition-colors duration-200"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          const Icon = ACTION_ICON[action];
          const isPositive = action === "APPROVE" || action === "REGARD";
          return (
            <Button
              key={action}
              size="sm"
              variant={isPositive ? "default" : "outline"}
              disabled={isPending}
              onClick={() => review(action)}
              className={cn(
                "cursor-pointer transition-colors duration-200",
                action === "RETURN" &&
                  "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10",
                action === "DISREGARD" &&
                  "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-500/30 dark:text-slate-300 dark:hover:bg-slate-500/10"
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {isPending ? "Saving..." : action.charAt(0) + action.slice(1).toLowerCase()}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
