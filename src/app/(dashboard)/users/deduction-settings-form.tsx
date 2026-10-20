"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_MATRIX, type MatrixCategory } from "@/lib/utils/deductionMatrix";

// Workstream L2 — Super Admin edits SLU's deduction matrix (faculty revise it)
// and the default hours a conduct record deducts.
// shortcut: the matrix is edited as validated JSON; upgrade to a table editor
// if non-technical admins need to change it often.
export function DeductionSettingsForm({
  matrix,
  defaultHours,
}: {
  matrix: MatrixCategory[];
  defaultHours: number;
}) {
  const router = useRouter();
  const [json, setJson] = useState(() => JSON.stringify(matrix, null, 2));
  const [hours, setHours] = useState(String(defaultHours));
  const [pending, setPending] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      toast.error("The matrix isn't valid JSON");
      return;
    }
    setPending(true);
    const res = await fetch("/api/config/deductions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matrix: parsed, defaultHours: Number(hours) }),
    });
    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      const issue = b.issues?.[0];
      toast.error(
        issue
          ? `${issue.path?.join(".") ?? ""} ${issue.message}`.trim()
          : (b.error ?? "Could not save")
      );
      return;
    }
    toast.success("Deduction settings saved");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="default-conduct-hours">Default hours deducted per conduct record</Label>
        <Input
          id="default-conduct-hours"
          type="number"
          min={0}
          max={40}
          step={0.5}
          value={hours}
          disabled={pending}
          onChange={(e) => setHours(e.target.value)}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          0 means conduct records don&apos;t reduce rendered hours.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="deduction-matrix">Deduction matrix (ADVISER / WWR points per count)</Label>
        <Textarea
          id="deduction-matrix"
          rows={16}
          spellCheck={false}
          className="font-mono text-xs"
          value={json}
          disabled={pending}
          onChange={(e) => setJson(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Each category: key, label, mode (TOTAL_AT_COUNT or PER_INCIDENT), source (MANUAL or
          AUTOMATIC), tiers [{"{"} count, adviser, wwr {"}"}], optional extraIfNoValidReason.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="cursor-pointer">
          {pending ? "Saving…" : "Save deduction settings"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="cursor-pointer"
          onClick={() => setJson(JSON.stringify(DEFAULT_MATRIX, null, 2))}
        >
          Reset matrix to SLU defaults
        </Button>
      </div>
    </form>
  );
}
