"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GitMerge } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";

type Member = {
  id: string;
  name: string;
  address: string;
  isVerified: boolean;
  _count: { students: number; moaRecords: number };
};

// One group of same-name companies: pick the one to keep, the rest fold into it.
export function MergeDuplicates({ group }: { group: Member[] }) {
  const router = useRouter();
  // Default to the one with the most history: verified first, then most interns and MOAs.
  const [keepId, setKeepId] = useState(
    () =>
      [...group].sort(
        (a, b) =>
          Number(b.isVerified) - Number(a.isVerified) ||
          b._count.students + b._count.moaRecords - (a._count.students + a._count.moaRecords)
      )[0].id
  );
  const [pending, setPending] = useState(false);

  async function merge() {
    setPending(true);
    const mergeIds = group.filter((c) => c.id !== keepId).map((c) => c.id);
    const res = await sendJson("/api/companies/merge", {
      method: "POST",
      body: { keepId, mergeIds },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Companies merged");
    router.refresh();
  }

  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-xs text-muted-foreground">
        Keep one; the others merge into it
      </legend>
      {group.map((c) => (
        <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="radio"
            name={`keep-${group[0].id}`}
            checked={keepId === c.id}
            onChange={() => setKeepId(c.id)}
            className="size-4 cursor-pointer accent-primary"
          />
          <span className="min-w-0">
            <span className="font-medium text-foreground">{c.name}</span>
            <span className="text-muted-foreground">
              {" "}
              · {c.address} · {c._count.students} {c._count.students === 1 ? "intern" : "interns"},{" "}
              {c._count.moaRecords} MOA{c._count.moaRecords === 1 ? "" : "s"}
              {c.isVerified ? " · verified" : ""}
            </span>
          </span>
        </label>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => void merge()}
        className="cursor-pointer gap-1.5"
      >
        <GitMerge className="size-4" aria-hidden="true" />
        {pending ? "Merging..." : "Merge into the selected one"}
      </Button>
    </fieldset>
  );
}
