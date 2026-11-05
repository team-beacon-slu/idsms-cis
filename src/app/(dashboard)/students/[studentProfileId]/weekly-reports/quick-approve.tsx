"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";

// One click from the list once the signed copy is in Google Classroom (the adviser: fewer
// clicks). Returning a report with notes still goes through Review.
export function QuickApprove({ weeklyReportId }: { weeklyReportId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function approve() {
    setPending(true);
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/review`, {
      method: "PATCH",
      body: { action: "APPROVE" },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Report approved");
    router.refresh();
  }

  return (
    <Button size="sm" disabled={pending} onClick={approve} className="cursor-pointer gap-1.5">
      <Check className="size-3.5" aria-hidden="true" />
      {pending ? "Approving..." : "Approve"}
    </Button>
  );
}
