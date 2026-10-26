"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SCALE = ["Very poor", "Poor", "Fair", "Good", "Very good"];

export function CompanyEvaluationForm({
  studentProfileId,
  companyName,
  criteria,
}: {
  studentProfileId: string;
  companyName: string;
  criteria: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const complete = criteria.every((c) => ratings[c.key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendJson(`/api/students/${studentProfileId}/company-evaluation`, {
      method: "POST",
      body: { ...ratings, comment },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Evaluation sent. Thank you!");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{companyName}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Rate your experience, not a person: &quot;my supervisor&quot;, never a name. You can send
          this once.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          {criteria.map((c) => (
            <fieldset key={c.key} className="space-y-2">
              <legend className="text-sm font-medium">{c.label}</legend>
              <div className="flex flex-wrap gap-2">
                {SCALE.map((word, i) => {
                  const value = i + 1;
                  const checked = ratings[c.key] === value;
                  return (
                    <label
                      key={value}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${checked ? "border-primary bg-primary/10 font-medium" : "border-input"}`}
                    >
                      <input
                        type="radio"
                        name={c.key}
                        value={value}
                        checked={checked}
                        onChange={() => setRatings((r) => ({ ...r, [c.key]: value }))}
                        className="sr-only"
                      />
                      {value} · {word}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="space-y-2">
            <Label htmlFor="evaluation-comment">Anything else? (optional)</Label>
            <Textarea
              id="evaluation-comment"
              rows={3}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What should future interns or SLU know about this company?"
            />
          </div>
          <Button type="submit" disabled={!complete || pending} className="cursor-pointer">
            {pending ? "Sending…" : "Send evaluation"}
          </Button>
          {!complete && (
            <p className="text-xs text-muted-foreground">Rate all {criteria.length} to send.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
