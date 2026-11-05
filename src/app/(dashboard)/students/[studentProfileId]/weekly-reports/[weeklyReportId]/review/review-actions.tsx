"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Check, EyeOff, RotateCcw, ThumbsUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS = ["APPROVE", "RETURN", "REGARD", "DISREGARD"] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_PAST_TENSE: Record<Action, string> = {
  APPROVE: "approved",
  RETURN: "returned",
  REGARD: "regarded",
  DISREGARD: "disregarded",
};

const ACTION_ICON: Record<Action, LucideIcon> = {
  APPROVE: Check,
  RETURN: RotateCcw,
  REGARD: ThumbsUp,
  DISREGARD: EyeOff,
};

// One tap fills the note with the usual reasons; the adviser can still edit it.
export const RETURN_REASONS = [
  "Accomplishments are too vague: say what you worked on and finished each day.",
  "The times don't match your schedule: check time in and time out.",
  "The supervisor-signed copy isn't on Google Classroom yet.",
  "A day is copied from an earlier week: describe what you did that day.",
];

// Asked once more before it happens: deleting a week, or approving one that has flags.
type Confirm = "DISREGARD" | "APPROVE" | null;

export function WeeklyReportReviewActions({
  weeklyReportId,
  next = null,
  flags = [],
}: {
  weeklyReportId: string;
  /** The queue's next week, opened after a decision (Approve & next). */
  next?: { href: string; intern: string; left: number } | null;
  /** The queue's flags for this week (copy, vague days, ...). */
  flags?: string[];
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function review(action: Action, confirmed = false) {
    if ((action === "RETURN" || action === "DISREGARD") && notes.trim().length === 0) {
      toast.error(
        action === "RETURN"
          ? "Notes are required when returning a report"
          : "Give the intern a reason when you disregard a week"
      );
      return;
    }
    if (!confirmed && (action === "DISREGARD" || (action === "APPROVE" && flags.length > 0))) {
      setConfirm(action);
      return;
    }

    setIsPending(true);
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/review`, {
      method: "PATCH",
      body: { action, notes: notes.trim() || undefined },
    });
    setIsPending(false);
    setConfirm(null);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (next) {
      toast.success(`Report ${ACTION_PAST_TENSE[action]}. Next: ${next.intern}`);
      router.push(next.href);
    } else {
      toast.success(`Report ${ACTION_PAST_TENSE[action]}. Nothing else is waiting.`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="review-notes" className="text-sm text-muted-foreground">
          Notes (required for Return and Disregard)
        </Label>
        <Textarea
          id="review-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add context for the student, e.g. what needs to be revised…"
          disabled={isPending}
          className="transition-colors duration-200"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common reasons">
          {RETURN_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={isPending}
              onClick={() =>
                setNotes((n) =>
                  n.includes(reason) ? n : n.trim() ? `${n.trim()}\n${reason}` : reason
                )
              }
              className="min-h-8 cursor-pointer rounded-full border border-input px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed"
            >
              {reason.split(":")[0]}
            </button>
          ))}
        </div>
      </div>

      {confirm && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
        >
          {confirm === "DISREGARD" ? (
            <p>
              Disregard deletes this week&apos;s report and its hours. The intern gets your reason
              and starts the week again.
            </p>
          ) : (
            <>
              <p>This week has flags. Approve it anyway?</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={confirm === "DISREGARD" ? "outline" : "default"}
              disabled={isPending}
              onClick={() => review(confirm, true)}
              className="cursor-pointer"
            >
              {isPending
                ? "Saving..."
                : confirm === "DISREGARD"
                  ? "Disregard this week"
                  : "Approve anyway"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => setConfirm(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map((action) => {
          const Icon = ACTION_ICON[action];
          const isPositive = action === "APPROVE" || action === "REGARD";
          const label = action.charAt(0) + action.slice(1).toLowerCase();
          return (
            <Button
              key={action}
              size="sm"
              variant={isPositive ? "default" : "outline"}
              disabled={isPending || confirm !== null}
              onClick={() => review(action)}
              className={cn(
                "cursor-pointer transition-colors duration-200",
                action === "RETURN" &&
                  "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10",
                action === "DISREGARD" &&
                  "border-slate-300 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500/10"
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {isPending ? "Saving..." : action === "APPROVE" && next ? "Approve & next" : label}
            </Button>
          );
        })}
        {next && (
          <span className="text-xs text-muted-foreground">
            {next.left} more waiting · next: {next.intern}
          </span>
        )}
      </div>
    </div>
  );
}
