"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function WorkPlanReviewActions({ workPlanId }: { workPlanId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  // Return asks what to fix (same as checklist returns): a bare return costs a round trip.
  const [returning, setReturning] = useState(false);
  const [comments, setComments] = useState("");

  async function review(action: "APPROVE" | "RETURN") {
    if (action === "RETURN" && !comments.trim()) {
      toast.error("Say what the intern should fix");
      return;
    }
    setIsPending(true);
    const res = await sendJson(`/api/work-plans/${workPlanId}/review`, {
      method: "PATCH",
      body: action === "RETURN" ? { action, comments: comments.trim() } : { action },
    });
    setIsPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(action === "APPROVE" ? "Work plan approved" : "Work plan returned");
    setReturning(false);
    setComments("");
    router.refresh();
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      {returning && (
        <div className="space-y-1.5">
          <Label htmlFor={`wp-return-${workPlanId}`}>What should the intern fix?</Label>
          <Textarea
            id={`wp-return-${workPlanId}`}
            value={comments}
            maxLength={2000}
            rows={3}
            autoFocus
            disabled={isPending}
            onChange={(e) => setComments(e.target.value)}
            placeholder="e.g. Add the hours for each row; the period for row 3 is missing."
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!returning && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => review("APPROVE")}
            className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {isPending ? "Saving..." : "Approve"}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => (returning ? review("RETURN") : setReturning(true))}
          className={cn(
            "cursor-pointer gap-1.5 border-red-200 text-red-700 transition-colors duration-200 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed",
            "dark:border-red-500/30 dark:hover:bg-red-500/10"
          )}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {isPending ? "Saving..." : returning ? "Send back with this note" : "Return"}
        </Button>
        {returning && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setReturning(false)}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
