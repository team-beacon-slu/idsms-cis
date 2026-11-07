"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MATRIX, type MatrixCategory, type Points } from "@/lib/utils/deductionMatrix";

// Workstream L2 — Super Admin edits SLU's deduction matrix (faculty revise it)
// and the default hours a conduct record deducts. Efficiency item 33: a table per category
// (points per count) instead of raw JSON. Keys, labels, mode and source stay as SLU set them;
// the tally code depends on them.
export function DeductionSettingsForm({
  matrix: initialMatrix,
  defaultHours,
}: {
  matrix: MatrixCategory[];
  defaultHours: number;
}) {
  const router = useRouter();
  const [matrix, setMatrix] = useState(initialMatrix);
  const [hours, setHours] = useState(String(defaultHours));
  const [pending, setPending] = useState(false);

  const update = (ci: number, patch: (c: MatrixCategory) => MatrixCategory) =>
    setMatrix((m) => m.map((c, i) => (i === ci ? patch(c) : c)));
  const setTier = (ci: number, ti: number, key: keyof Points, value: string) =>
    update(ci, (c) => ({
      ...c,
      tiers: c.tiers.map((t, j) => (j === ti ? { ...t, [key]: Number(value) } : t)),
    }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await fetch("/api/config/deductions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matrix,
        // An empty box leaves the default unchanged rather than resetting it to 0.
        ...(hours.trim() !== "" ? { defaultHours: Number(hours) } : {}),
      }),
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

  const points = (id: string, label: string, value: number, onChange: (v: string) => void) => (
    <Input
      id={id}
      aria-label={label}
      type="number"
      min={0}
      max={100}
      step={0.5}
      required
      value={value}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-20"
    />
  );

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
        <p className="text-[13px] text-muted-foreground">
          0 means conduct records don&apos;t reduce rendered hours.
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium">Deduction matrix (grade points per count)</p>
        {matrix.map((c, ci) => (
          <fieldset key={c.key} className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{c.label}</legend>
            <p className="text-xs text-muted-foreground">
              {c.mode === "PER_INCIDENT"
                ? "Points add up per incident."
                : "The row at the count is the total."}{" "}
              {c.source === "AUTOMATIC" ? "Counted by IDSMS." : "Counted from conduct records."}
            </p>
            {c.tiers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No points set yet.</p>
            ) : (
              <table className="text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Count</th>
                    <th className="py-1 pr-4 font-medium">Adviser</th>
                    <th className="py-1 font-medium">WWR</th>
                  </tr>
                </thead>
                <tbody>
                  {c.tiers.map((t, ti) => (
                    <tr key={t.count}>
                      <td className="py-1 pr-4 tabular-nums">{t.count}</td>
                      <td className="py-1 pr-4">
                        {points(
                          `${c.key}-${ti}-a`,
                          `${c.label}, count ${t.count}, adviser points`,
                          t.adviser,
                          (v) => setTier(ci, ti, "adviser", v)
                        )}
                      </td>
                      <td className="py-1">
                        {points(
                          `${c.key}-${ti}-w`,
                          `${c.label}, count ${t.count}, WWR points`,
                          t.wwr,
                          (v) => setTier(ci, ti, "wwr", v)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {c.extraIfNoValidReason && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground">Extra without a valid reason:</span>
                {points(
                  `${c.key}-extra-a`,
                  `${c.label}, extra adviser points`,
                  c.extraIfNoValidReason.adviser,
                  (v) =>
                    update(ci, (x) => ({
                      ...x,
                      extraIfNoValidReason: { ...x.extraIfNoValidReason!, adviser: Number(v) },
                    }))
                )}
                {points(
                  `${c.key}-extra-w`,
                  `${c.label}, extra WWR points`,
                  c.extraIfNoValidReason.wwr,
                  (v) =>
                    update(ci, (x) => ({
                      ...x,
                      extraIfNoValidReason: { ...x.extraIfNoValidReason!, wwr: Number(v) },
                    }))
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  update(ci, (x) => {
                    const last = x.tiers.at(-1);
                    const next = {
                      count: (last?.count ?? 0) + 1,
                      adviser: last?.adviser ?? 0,
                      wwr: last?.wwr ?? 0,
                    };
                    return { ...x, tiers: [...x.tiers, next] };
                  })
                }
                className="cursor-pointer gap-1.5"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Add count {(c.tiers.at(-1)?.count ?? 0) + 1}
              </Button>
              {c.tiers.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => update(ci, (x) => ({ ...x, tiers: x.tiers.slice(0, -1) }))}
                  className="cursor-pointer gap-1.5"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Remove count {c.tiers.at(-1)?.count}
                </Button>
              )}
            </div>
          </fieldset>
        ))}
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
          onClick={() => setMatrix(DEFAULT_MATRIX)}
        >
          Reset matrix to SLU defaults
        </Button>
      </div>
    </form>
  );
}
