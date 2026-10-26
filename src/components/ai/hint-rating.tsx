"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { sendJson } from "@/lib/utils/sendJson";
import { cn } from "@/lib/utils";

// R2: every hint can be marked Correct or Not right. Enough "Not right" switches the job
// off for everyone until IT re-tests it.
export function HintRating({ job, targetId }: { job: string; targetId: string }) {
  const [vote, setVote] = useState<boolean | null>(null);
  const [error, setError] = useState(false);

  async function rate(correct: boolean) {
    setError(false);
    const res = await sendJson("/api/ai/feedback", {
      method: "POST",
      body: { job, targetId, correct },
    });
    if (res.ok) setVote(correct);
    else setError(true);
  }

  const btn = (correct: boolean, label: string, Icon: typeof Check) => (
    <button
      type="button"
      aria-pressed={vote === correct}
      onClick={() => rate(correct)}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
        vote === correct
          ? "border-brand-600 bg-brand-50 font-medium text-brand-900"
          : "border-border text-foreground/80 hover:bg-brand-50"
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {btn(true, "Correct", Check)}
      {btn(false, "Not right", X)}
      {error && <span className="text-xs text-destructive">Not saved; try again.</span>}
    </span>
  );
}
