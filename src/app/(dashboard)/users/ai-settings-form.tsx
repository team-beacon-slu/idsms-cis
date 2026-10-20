"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiSettings } from "@/lib/ai/settings";
import type { EvalResult } from "@/lib/ai/evaluation";

// Workstream D — Super Admin AI settings. A threshold is confirmed only after
// its precision/recall preview has been shown (NFR-AI-03). Enabling needs a
// privacy approval (D5) and a passing evaluation (NFR-AI-02); the server
// enforces both and its message is shown verbatim.
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

async function send(method: string, body: unknown) {
  const res = await fetch("/api/config/ai", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error(json.issues?.[0]?.message ?? json.error ?? "Request failed");
    return null;
  }
  return json;
}

export function AiSettingsForm({ settings }: { settings: AiSettings }) {
  const router = useRouter();
  const [threshold, setThreshold] = useState(String(settings.similarityThreshold));
  const [preview, setPreview] = useState<EvalResult | null>(null);
  const [approvedBy, setApprovedBy] = useState(settings.privacyApprovedBy ?? "");
  const [pending, setPending] = useState(false);
  const previewMatches = preview !== null && preview.threshold === Number(threshold);

  async function run<T>(fn: () => Promise<T>) {
    setPending(true);
    try {
      return await fn();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-sm">
        <p>
          Status: <strong>{settings.enabled ? "Enabled" : "Disabled"}</strong>
          {settings.privacyApprovedBy && ` · privacy approved by ${settings.privacyApprovedBy}`}
        </p>
        <p className="text-muted-foreground">
          {settings.lastEval
            ? `Last evaluation at ${settings.lastEval.threshold}: precision ${pct(settings.lastEval.precision)}, recall ${pct(settings.lastEval.recall)} on ${settings.lastEval.pairCount} pairs — ${settings.lastEval.passes ? "passes" : "does not pass"}.`
            : "No golden-set evaluation yet. Run scripts/ai-golden-eval.ts with the adviser's labelled pairs."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-threshold">Similarity threshold (0.60–0.85)</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="ai-threshold"
            type="number"
            min={0.6}
            max={0.85}
            step={0.01}
            value={threshold}
            disabled={pending}
            onChange={(e) => {
              setThreshold(e.target.value);
              setPreview(null);
            }}
            className="w-28"
          />
          <Button
            variant="outline"
            disabled={pending}
            className="cursor-pointer"
            onClick={() =>
              run(async () =>
                setPreview(await send("POST", { previewThreshold: Number(threshold) }))
              )
            }
          >
            Preview
          </Button>
          <Button
            disabled={pending || !previewMatches}
            title={previewMatches ? undefined : "Preview this value first"}
            className="cursor-pointer disabled:cursor-not-allowed"
            onClick={() =>
              run(async () => {
                if (await send("PATCH", { threshold: Number(threshold) })) {
                  toast.success("Threshold saved");
                  router.refresh();
                }
              })
            }
          >
            Confirm threshold
          </Button>
        </div>
        {preview && (
          <p className="text-sm" role="status">
            At {preview.threshold}: precision {pct(preview.precision)}, recall {pct(preview.recall)}{" "}
            ({preview.tp} TP, {preview.fp} FP, {preview.fn} FN, {preview.tn} TN) —{" "}
            {preview.passes ? "passes" : "does not pass"} NFR-AI-02.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-privacy">Privacy basis approved by (adviser, D5)</Label>
        <Input
          id="ai-privacy"
          value={approvedBy}
          disabled={pending}
          onChange={(e) => setApprovedBy(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2">
          <Button
            disabled={pending || settings.enabled}
            className="cursor-pointer"
            onClick={() =>
              run(async () => {
                if (await send("PATCH", { enabled: true, privacyApprovedBy: approvedBy || null })) {
                  toast.success("AI advisories enabled");
                  router.refresh();
                }
              })
            }
          >
            Enable AI advisories
          </Button>
          <Button
            variant="outline"
            disabled={pending || !settings.enabled}
            className="cursor-pointer"
            onClick={() =>
              run(async () => {
                if (await send("PATCH", { enabled: false, privacyApprovedBy: null })) {
                  toast.success("AI advisories disabled");
                  router.refresh();
                }
              })
            }
          >
            Disable
          </Button>
        </div>
      </div>
    </div>
  );
}
