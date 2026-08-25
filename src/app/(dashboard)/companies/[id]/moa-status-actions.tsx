"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoaStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// FR-MOA-04's lifecycle is a strict allow-list (see companyService's
// ALLOWED_MOA_TRANSITIONS) — the server re-validates every transition, this
// just renders whichever next statuses the server already told us are legal.
export function MoaStatusActions({
  moaId,
  nextStatuses,
}: {
  moaId: string;
  nextStatuses: MoaStatus[];
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function advance(status: MoaStatus) {
    setIsPending(true);
    const res = await fetch(`/api/moa/${moaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setIsPending(false);

    if (!res.ok) {
      const body = await res.json();
      toast.error(body.error ?? "Status update failed");
      return;
    }
    toast.success(`MOA moved to ${status}`);
    router.refresh();
  }

  if (nextStatuses.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2">
      {nextStatuses.map((status) => (
        <Button
          key={status}
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => advance(status)}
        >
          {status}
        </Button>
      ))}
    </div>
  );
}
