"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChecklistItemRowProps {
  itemId: string;
  status: string;
  canReview: boolean;
}

export function ChecklistItemRow({ itemId, status, canReview }: ChecklistItemRowProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const trimmedNote = note.trim();

  async function review(action: "APPROVE" | "RETURN", comments?: string) {
    setIsPending(true);
    const res = await sendJson(`/api/checklist-items/${itemId}/review`, {
      method: "PATCH",
      body: { action, comments },
    });
    setIsPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(action === "APPROVE" ? "Approved" : "Returned");
    setReturning(false);
    setNote("");
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
            disabled={isPending || returning}
            onClick={() => setReturning(true)}
            className={cn(
              "cursor-pointer gap-1.5 border-red-200 text-red-700 transition-colors duration-200 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed",
              "dark:border-red-500/30 dark:hover:bg-red-500/10"
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {isPending ? "Saving..." : "Return"}
          </Button>
        </>
      )}
      {canReview && status !== "APPROVED" && returning && (
        <div className="flex w-full flex-col items-stretch gap-2 text-left">
          <label htmlFor={`return-note-${itemId}`} className="text-sm font-medium">
            What does the student need to fix?
          </label>
          <Textarea
            id={`return-note-${itemId}`}
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setReturning(false);
                setNote("");
              }}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isPending || trimmedNote.length === 0}
              onClick={() => review("RETURN", trimmedNote)}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              {isPending ? "Saving..." : "Return with note"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
