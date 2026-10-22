"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";

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

  async function review(action: "APPROVE" | "REJECT") {
    setIsSaving(true);
    const res = await sendJson(`/api/work-plans/${workPlanId}/schedule-change/${stage}-review`, {
      method: "PATCH",
      body: { action },
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
          ? "Approved. It now goes to the department coordinator."
          : "Schedule change approved. It applies from today."
    );
    // Keep the buttons busy until the refreshed status arrives, so nobody clicks twice.
    startRefresh(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => review("APPROVE")}
        className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
      >
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {isPending ? "Saving..." : "Approve"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => review("REJECT")}
        className="cursor-pointer gap-1.5 text-destructive disabled:cursor-not-allowed"
      >
        <XCircle className="size-3.5" aria-hidden="true" />
        Reject
      </Button>
    </div>
  );
}
