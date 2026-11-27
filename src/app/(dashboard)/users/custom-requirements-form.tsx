"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type CustomRequirementRow = {
  id: string;
  name: string;
  description: string | null;
  programs: string[];
  required: boolean;
  active: boolean;
};

// Requirements added beyond the built-in list (defense panel request). Retiring takes one
// out of the endorsement gate; interns keep their items for it, marked retired.
export function CustomRequirementsForm({
  rows,
  programs,
}: {
  rows: CustomRequirementRow[];
  programs: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [required, setRequired] = useState(true);
  const [pending, setPending] = useState(false);
  // Retire asks twice: the first click turns the button into the confirmation.
  const [confirming, setConfirming] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendJson("/api/config/checklist/custom", {
      method: "POST",
      body: { name, description, programs: [...picked], required },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const n = Number(res.body.itemsCreated ?? 0);
    toast.success(`Added "${name.trim()}" to ${n} ${n === 1 ? "intern's" : "interns'"} checklists`);
    setName("");
    setDescription("");
    setPicked(new Set());
    setRequired(true);
    router.refresh();
  }

  async function retire(row: CustomRequirementRow) {
    setPending(true);
    const res = await sendJson(`/api/config/checklist/custom/${row.id}/retire`, {
      method: "POST",
    });
    setPending(false);
    setConfirming(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Retired "${row.name}"`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {rows.length > 0 && (
        <ul aria-label="Added requirements" className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <span className="text-sm">
                <span className="font-medium text-foreground">{row.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {[
                    row.programs.length ? row.programs.join(", ") : "All programs",
                    row.required ? "required" : "optional",
                    !row.active && "retired",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {row.description && (
                  <span className="block text-[13px] text-muted-foreground">{row.description}</span>
                )}
              </span>
              {row.active && (
                <span className="flex gap-2">
                  {confirming === row.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setConfirming(null)}
                      className="cursor-pointer"
                    >
                      Keep
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={confirming === row.id ? "destructive" : "outline"}
                    disabled={pending}
                    onClick={() => (confirming === row.id ? retire(row) : setConfirming(row.id))}
                    className="cursor-pointer"
                  >
                    {confirming === row.id ? "Yes, retire it (interns keep their items)" : "Retire"}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Add requirement</h3>
        <div className="space-y-2">
          <Label htmlFor="custom-requirement-name">Name</Label>
          <Input
            id="custom-requirement-name"
            required
            minLength={3}
            maxLength={120}
            placeholder="e.g. Vaccination card"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="custom-requirement-description">What interns submit (optional)</Label>
          <Textarea
            id="custom-requirement-description"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <fieldset className="flex flex-wrap gap-x-6 gap-y-1">
          <legend className="mb-1 text-sm font-medium">Programs (none ticked = all)</legend>
          {programs.map((p) => (
            <label key={p} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked.has(p)}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(p)) next.delete(p);
                    else next.add(p);
                    return next;
                  })
                }
                className="size-4 cursor-pointer accent-primary"
              />
              {p}
            </label>
          ))}
        </fieldset>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={required}
            onChange={() => setRequired((r) => !r)}
            className="size-4 cursor-pointer accent-primary"
          />
          Required for the endorsement letter
        </label>
        <Button type="submit" disabled={pending} className="cursor-pointer">
          {pending ? "Saving..." : "Add requirement"}
        </Button>
      </form>
    </div>
  );
}
