"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { cn } from "@/lib/utils";

// The person's own AI assist switch (Profile and the account menu). Off hides every AI
// hint and AI tool for them; nothing else changes.
export function AiAssistSwitch({
  initial,
  compact = false,
}: {
  initial: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const res = await sendJson("/api/ai/assist", { method: "PATCH", body: { on: !on } });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOn(!on);
    router.refresh();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={saving}
      onClick={toggle}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg text-left text-sm text-foreground/85 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-wait",
        compact ? "h-10 px-2.5" : "border border-border px-3 py-3"
      )}
    >
      <Sparkles className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">AI assist</span>
        {!compact && (
          <span className="block text-xs text-muted-foreground">
            Hints that point to what interns wrote. They never decide anything.
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-brand-600" : "bg-muted-foreground/40"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-transform",
            on ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}
