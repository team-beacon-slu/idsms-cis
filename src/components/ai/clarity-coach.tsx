"use client";

import { useState } from "react";
import { HelpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/utils/sendJson";
import { QUESTIONS, vagueDays, type QuestionId } from "@/lib/ai/clarity";

type Day = { id: string; label: string; text: string; tools?: string | null };
type Flag = { id: string; questions: QuestionId[] };

// Job 8: questions on vague days before submitting. Warn only; the intern can submit anyway.
export function ClarityCoach({ days, aiOn }: { days: Day[]; aiOn: boolean }) {
  const [aiResult, setAiResult] = useState<{ key: string; days: Flag[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const key = JSON.stringify(days.map((d) => [d.id, d.text, d.tools]));
  // An AI answer only stands for the text it read; any edit falls back to the rules.
  const fresh = aiResult?.key === key;
  const flagged = fresh ? aiResult.days : vagueDays(days);
  const labelOf = (id: string) => days.find((d) => d.id === id)?.label ?? "";

  async function askAi() {
    setChecking(true);
    const res = await sendJson("/api/ai/clarity", {
      method: "POST",
      body: { days: days.map(({ id, text, tools }) => ({ id, text, tools })) },
    });
    setChecking(false);
    if (res.ok) setAiResult({ key, days: res.body.days as Flag[] });
  }

  if (!flagged.length && !aiOn) return null;
  return (
    <section
      aria-labelledby="clarity-coach"
      className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3 text-sm"
    >
      <h3 id="clarity-coach" className="flex items-center gap-2 font-medium text-foreground">
        <HelpCircle className="size-4 text-brand-700" aria-hidden="true" />
        Before you submit
      </h3>
      {flagged.length ? (
        <ul className="space-y-1.5">
          {flagged.map((d) => (
            <li key={d.id}>
              <span className="font-medium text-foreground">{labelOf(d.id)}:</span>{" "}
              <span className="text-foreground/85">
                {d.questions.map((q) => QUESTIONS[q]).join(" ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-foreground/85">Every day says what you did.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Only you see this; your adviser does not. It never changes your entries, and you can submit
        anyway.
      </p>
      {aiOn && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={askAi}
          disabled={checking}
          className="cursor-pointer gap-1.5"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {checking ? "Checking..." : fresh ? "Checked by AI assist" : "Check with AI assist"}
        </Button>
      )}
    </section>
  );
}
