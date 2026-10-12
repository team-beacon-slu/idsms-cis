"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChecklistItemRowProps {
  itemId: string;
  status: string;
  canReview: boolean;
}

export function ChecklistItemRow({ itemId, status, canReview }: ChecklistItemRowProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function review(action: "APPROVE" | "RETURN") {
    setIsPending(true);
    const res = await fetch(`/api/checklist-items/${itemId}/review`, {
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
    toast.success(action === "APPROVE" ? "Approved" : "Returned");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canReview && status !== "APPROVED" && (
        <>
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
            onClick={() => review("RETURN")}
            className={cn(
              "cursor-pointer gap-1.5 border-red-200 text-red-700 transition-colors duration-200 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed",
              "dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {isPending ? "Saving..." : "Return"}
          </Button>
        </>
      )}
    </div>
  );
}
