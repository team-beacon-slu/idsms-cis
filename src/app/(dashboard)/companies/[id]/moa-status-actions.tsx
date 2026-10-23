"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MoaStatus } from "@prisma/client";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { ArrowRight } from "lucide-react";
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
    const res = await sendJson(`/api/moa/${moaId}`, { method: "PATCH", body: { status } });
    setIsPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`MOA moved to ${status}`);
    router.refresh();
  }

  if (nextStatuses.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => (
        <Button
          key={status}
          size="sm"
          variant="outline"
          className="cursor-pointer gap-1.5"
          disabled={isPending}
          onClick={() => advance(status)}
        >
          {isPending ? (
            "Saving..."
          ) : (
            <>
              <ArrowRight className="size-3.5" aria-hidden="true" />
              {status}
            </>
          )}
        </Button>
      ))}
    </div>
  );
}
