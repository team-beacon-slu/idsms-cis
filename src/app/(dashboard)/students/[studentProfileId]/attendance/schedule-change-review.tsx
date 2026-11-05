"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// FR-AT-08 two-step approval: the adviser decides first, then the coordinator.
// The routes existed with no buttons, so a requested change waited forever.
export function ScheduleChangeReview({
  workPlanId,
  stage,
}: {
  workPlanId: string;
  stage: "faculty" | "coordinator";
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const isPending = isSaving || isRefreshing;
  // Reject asks why first (the intern gets the reason); Approve stays one click.
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function review(action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !reason.trim()) {
      toast.error("Give the intern a reason for rejecting");
      return;
    }
    setIsSaving(true);
    const res = await sendJson(`/api/work-plans/${workPlanId}/schedule-change/${stage}-review`, {
      method: "PATCH",
      body: action === "REJECT" ? { action, reason: reason.trim() } : { action },
    });
    setIsSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      action === "REJECT"
        ? "Schedule change rejected"
        : stage === "faculty"
          ? "Approved. It now goes to the internship coordinator."
          : "Schedule change approved. It applies from today."
    );
    // Keep the buttons busy until the refreshed status arrives, so nobody clicks twice.
    startRefresh(() => router.refresh());
  }

  return (
    <div className="space-y-2 pt-2">
      {rejecting && (
        <div className="space-y-1.5">
          <Label htmlFor={`sc-reason-${workPlanId}`}>Why is it rejected?</Label>
          <Textarea
            id={`sc-reason-${workPlanId}`}
            value={reason}
            maxLength={1000}
            rows={2}
            autoFocus
            disabled={isPending}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!rejecting && (
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
          onClick={() => (rejecting ? review("REJECT") : setRejecting(true))}
          className="cursor-pointer gap-1.5 text-destructive disabled:cursor-not-allowed"
        >
          <XCircle className="size-3.5" aria-hidden="true" />
          {rejecting ? "Reject with this reason" : "Reject"}
        </Button>
        {rejecting && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setRejecting(false)}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
