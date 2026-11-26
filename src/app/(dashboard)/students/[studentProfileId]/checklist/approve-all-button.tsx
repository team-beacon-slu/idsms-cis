"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";

// Approve every item of one intern that is waiting for review, through the same bulk route
// as the class grid. Returned items are left for one-at-a-time review so their notes stay.
// Items the gate refuses (work plan, MOA) stay and are named in the toast.
export function ApproveAllButton({ itemIds }: { itemIds: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function approveAll() {
    setPending(true);
    const res = await sendJson("/api/checklist-items/bulk-review", {
      method: "POST",
      body: { itemIds },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const approved = Number(res.body.approved ?? 0);
    const failed = (res.body.failed as { id: string; error: string }[] | undefined) ?? [];
    if (failed.length === 0) toast.success(`Approved ${approved}`);
    else
      toast.warning(
        `Approved ${approved}. ${failed.length} not approved: ${[...new Set(failed.map((f) => f.error))].join("; ")}`
      );
    router.refresh();
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending || itemIds.length === 0}
      onClick={approveAll}
      className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
    >
      <CheckCheck className="size-3.5" aria-hidden="true" />
      {pending ? "Approving..." : `Approve all (${itemIds.length})`}
    </Button>
  );
}
