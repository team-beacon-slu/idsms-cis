"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";

// Q21: fix a slip without asking the adviser to return the week (before review and deadline).
export function WithdrawReport({ weeklyReportId }: { weeklyReportId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function withdraw() {
    setPending(true);
    const res = await sendJson(`/api/weekly-reports/${weeklyReportId}/withdraw`, {
      method: "POST",
      body: {},
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Back to draft. Fix it, then submit again before the deadline");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={withdraw}
      className="cursor-pointer gap-1.5"
    >
      <Undo2 className="size-3.5" aria-hidden="true" />
      {pending ? "Taking back..." : "Take back to fix"}
    </Button>
  );
}
