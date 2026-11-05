"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { clearFormDraft, useFormDraft } from "@/lib/utils/formDraft";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMENT_QUESTIONS,
  IMPLEMENTATION_LEVELS,
  OBLIGATIONS,
  QUALITY,
  QUALITY_LEVELS,
} from "@/lib/validators/hteEvaluation";

type Level = { value: number; label: string };

// One FM-VAA-052 item: the four levels as radio buttons, highest first as on the form.
function Item({
  name,
  n,
  text,
  levels,
  value,
  onChange,
}: {
  name: string;
  n: number;
  text: string;
  levels: readonly Level[];
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset id={name} className="scroll-mt-6 space-y-2">
      <legend className="text-sm font-medium">
        {n}. {text}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {levels.map((l) => {
          const checked = value === l.value;
          return (
            <label
              key={l.value}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${checked ? "border-primary bg-primary/10 font-medium" : "border-input"}`}
            >
              <input
                type="radio"
                name={name}
                value={l.value}
                checked={checked}
                onChange={() => onChange(l.value)}
                className="sr-only"
              />
              <span className="font-semibold tabular-nums">{l.value}</span> {l.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const EMPTY = { liked: "", improve: "", comment: "" };

export function CompanyEvaluationForm({
  studentProfileId,
  companyName,
}: {
  studentProfileId: string;
  companyName: string;
}) {
  const router = useRouter();
  const [obligations, setObligations] = useState<(number | undefined)[]>(
    Array(OBLIGATIONS.length).fill(undefined)
  );
  const [quality, setQuality] = useState<(number | undefined)[]>(
    Array(QUALITY.length).fill(undefined)
  );
  const [comments, setComments] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const left = [...obligations, ...quality].filter((v) => v === undefined).length;
  // Efficiency item 27: "N left" jumps to the first unrated item.
  function goToFirstGap() {
    const i = obligations.findIndex((v) => v === undefined);
    const name =
      i >= 0 ? `obligation-${i}` : `quality-${quality.findIndex((v) => v === undefined)}`;
    const el = document.getElementById(name);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector("input")?.focus({ preventScroll: true });
  }
  // 22 ratings and 3 comments: a refresh or timeout must not lose them.
  const draftKey = `company-evaluation:${studentProfileId}`;
  const empty = (n: number) => Array<number | undefined>(n).fill(undefined);
  useFormDraft(
    draftKey,
    { obligations, quality, comments },
    { obligations: empty(OBLIGATIONS.length), quality: empty(QUALITY.length), comments: EMPTY },
    (draft) => {
      // JSON keeps an unanswered item as null.
      setObligations(draft.obligations.map((v) => v ?? undefined));
      setQuality(draft.quality.map((v) => v ?? undefined));
      setComments(draft.comments);
      toast.info("Restored your unsent answers.");
    }
  );

  const set = (list: typeof obligations, i: number, v: number) =>
    list.map((old, j) => (j === i ? v : old));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendJson(`/api/students/${studentProfileId}/company-evaluation`, {
      method: "POST",
      body: { obligations, quality, ...comments },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    clearFormDraft(draftKey);
    toast.success("Evaluation sent. Download the form for Google Classroom.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{companyName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          SLU&apos;s Host Training Establishment (HTE) Evaluation Form, FM-VAA-052. Your answers are
          confidential: staff see them only pooled with at least 4 other interns&apos;. You can send
          this once, then download it as a PDF.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-base font-semibold">
              Obligations and Responsibilities as per CMO No. 104 S. 2017
            </h2>
            <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">What the levels mean</summary>
              <dl className="mt-2 space-y-2">
                {IMPLEMENTATION_LEVELS.map((l) => (
                  <div key={l.value}>
                    <dt className="font-medium">
                      {l.value} {l.label}
                    </dt>
                    <dd className="text-muted-foreground">{l.description}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {OBLIGATIONS.map((text, i) => (
              <Item
                key={i}
                name={`obligation-${i}`}
                n={i + 1}
                text={text}
                levels={IMPLEMENTATION_LEVELS}
                value={obligations[i]}
                onChange={(v) => setObligations((o) => set(o, i, v))}
              />
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-semibold">Internship Quality</h2>
            {QUALITY.map((text, i) => (
              <Item
                key={i}
                name={`quality-${i}`}
                n={OBLIGATIONS.length + i + 1}
                text={text}
                levels={QUALITY_LEVELS}
                value={quality[i]}
                onChange={(v) => setQuality((q) => set(q, i, v))}
              />
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-semibold">Additional Comments (optional)</h2>
            {(["liked", "improve", "comment"] as const).map((key, i) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={`hte-${key}`}>
                  {"ABC"[i]}. {COMMENT_QUESTIONS[key]}
                </Label>
                <Textarea
                  id={`hte-${key}`}
                  rows={3}
                  maxLength={1000}
                  value={comments[key]}
                  onChange={(e) => setComments((c) => ({ ...c, [key]: e.target.value }))}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Describe your experience, not a person: &quot;my supervisor&quot;, never a name.
            </p>
          </section>

          <Button type="submit" disabled={left > 0 || pending} className="cursor-pointer">
            {pending ? "Sending…" : "Send evaluation"}
          </Button>
          {left > 0 && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {left} of 22 items left to rate.{" "}
              <button
                type="button"
                onClick={goToFirstGap}
                className="cursor-pointer font-medium text-primary underline underline-offset-2"
              >
                Go to the first one
              </button>
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
