"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";
import { HintRating } from "@/components/ai/hint-rating";
import { MergeDuplicates } from "./merge-duplicates";

type Member = Parameters<typeof MergeDuplicates>[0]["group"][number];

// Job 12 on demand: AI assist suggests pairs the name rules missed. Each pair merges only
// when the coordinator confirms it, and each can be rated.
export function AiDuplicates() {
  const [groups, setGroups] = useState<Member[][] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setBusy(true);
    setError(null);
    const res = await sendJson("/api/ai/companies", { method: "POST" });
    setBusy(false);
    if (res.ok) setGroups(res.body.groups as Member[][]);
    else setError(res.error);
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={find}
        disabled={busy}
        className="cursor-pointer gap-1.5"
      >
        <Sparkles className="size-4" aria-hidden="true" />
        {busy ? "Looking..." : "Find more with AI assist"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {groups?.length === 0 && (
        <p className="text-sm text-muted-foreground">AI assist found no other likely duplicates.</p>
      )}
      {groups?.map((group) => (
        <div key={group.map((c) => c.id).join(":")} className="space-y-1.5">
          <MergeDuplicates group={group} />
          <HintRating
            job="companies"
            targetId={group
              .map((c) => c.id)
              .sort()
              .join(":")}
          />
        </div>
      ))}
    </div>
  );
}
