"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ACTIONS = ["APPROVE", "RETURN", "REGARD", "DISREGARD"] as const;

export function WeeklyReportReviewActions({ weeklyReportId }: { weeklyReportId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function review(action: (typeof ACTIONS)[number]) {
    setIsPending(true);
    const res = await fetch(`/api/weekly-reports/${weeklyReportId}/review`, {
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
    toast.success(`Report ${action.toLowerCase()}d`);
    router.refresh();
  }

  return (
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
  );
}
