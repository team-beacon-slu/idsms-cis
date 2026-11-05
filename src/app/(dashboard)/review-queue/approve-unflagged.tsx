"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";

const KINDS = {
  week: {
    send: (id: string) =>
      sendJson(`/api/weekly-reports/${id}/review`, {
        method: "PATCH",
        body: { action: "APPROVE" },
      }),
    one: "week",
    many: "weeks",
    label: (n: string) => `Approve the ${n} with nothing flagged`,
  },
  request: {
    send: (id: string) =>
      sendJson(`/api/time-requests/${id}/review`, { method: "POST", body: { action: "APPROVE" } }),
    one: "time request",
    many: "time requests",
    label: (n: string) => `Approve all ${n}`,
  },
} as const;

// Approves, one after another, every week the queue found nothing to check in, or every pending
// time request (the adviser: fewer clicks). Stops at the first failure.
export function ApproveUnflagged({
  ids,
  kind = "week",
}: {
  ids: string[];
  kind?: keyof typeof KINDS;
}) {
  const router = useRouter();
  const [done, setDone] = useState<number | null>(null);
  const count = ids.length;
  const k = KINDS[kind];
  const noun = `${count} ${count === 1 ? k.one : k.many}`;

  async function approveAll() {
    setDone(0);
    let approved = 0;
    for (const id of ids) {
      const res = await k.send(id);
      if (!res.ok) {
        toast.error(`Stopped after ${approved} of ${count}: ${res.error}`);
        break;
      }
      approved += 1;
      setDone(approved);
    }
    if (approved === count) toast.success(`${noun} approved`);
    setDone(null);
    router.refresh();
  }

  return (
    <Button onClick={approveAll} disabled={done !== null} className="cursor-pointer gap-1.5">
      <CheckCheck className="size-4" aria-hidden="true" />
      {done === null ? k.label(noun) : `Approving ${done + 1} of ${count}...`}
    </Button>
  );
}
