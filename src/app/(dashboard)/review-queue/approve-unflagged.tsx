"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";

// Approves, one after another, every week the queue found nothing to check in (the adviser:
// fewer clicks). Flagged weeks stay for a look; stops at the first failure.
export function ApproveUnflagged({ weeklyReportIds }: { weeklyReportIds: string[] }) {
  const router = useRouter();
  const [done, setDone] = useState<number | null>(null);
  const count = weeklyReportIds.length;

  async function approveAll() {
    setDone(0);
    let approved = 0;
    for (const id of weeklyReportIds) {
      const res = await sendJson(`/api/weekly-reports/${id}/review`, {
        method: "PATCH",
        body: { action: "APPROVE" },
      });
      if (!res.ok) {
        toast.error(`Stopped after ${approved} of ${count}: ${res.error}`);
        break;
      }
      approved += 1;
      setDone(approved);
    }
    if (approved === count) toast.success(`${count} ${count === 1 ? "week" : "weeks"} approved`);
    setDone(null);
    router.refresh();
  }

  return (
    <Button onClick={approveAll} disabled={done !== null} className="cursor-pointer gap-1.5">
      <CheckCheck className="size-4" aria-hidden="true" />
      {done === null
        ? `Approve the ${count} ${count === 1 ? "week" : "weeks"} with nothing flagged`
        : `Approving ${done + 1} of ${count}...`}
    </Button>
  );
}
