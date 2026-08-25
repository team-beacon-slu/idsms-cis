"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function WorkPlanReviewActions({ workPlanId }: { workPlanId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function review(action: "APPROVE" | "RETURN") {
    setIsPending(true);
    const res = await fetch(`/api/work-plans/${workPlanId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setIsPending(false);

    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Review failed");
      return;
    }
    toast.success(action === "APPROVE" ? "Work plan approved" : "Work plan returned");
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={isPending} onClick={() => review("APPROVE")}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => review("RETURN")}>
        Return
      </Button>
    </div>
  );
}
