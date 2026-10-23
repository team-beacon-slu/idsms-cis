"use client";

import { useState } from "react";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { Button } from "@/components/ui/button";

const NOTE: Record<string, string> = {
  PROOF_OF_CORPORATE_LEGITIMACY: "Only for interns at a foreign-owned company",
  INTERNSHIP_AGREEMENT: "Only for irregular students (class type other than Regular)",
  MOA: "An adviser can still let an intern start before MOA approval",
};

export function ChecklistSettingsForm({
  items,
  initial,
}: {
  items: { type: string; label: string }[];
  initial: string[];
}) {
  const [required, setRequired] = useState(new Set(initial));
  const [pending, setPending] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await sendJson("/api/config/checklist", {
      method: "PATCH",
      body: { required: [...required] },
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${required.size} items now required for the endorsement letter`);
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
        <legend className="sr-only">Required checklist items</legend>
        {items.map(({ type, label }) => (
          <label
            key={type}
            className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              checked={required.has(type)}
              onChange={() =>
                setRequired((prev) => {
                  const next = new Set(prev);
                  if (next.has(type)) next.delete(type);
                  else next.add(type);
                  return next;
                })
              }
              className="mt-0.5 size-4 cursor-pointer accent-primary"
            />
            <span>
              <span className="font-medium text-foreground">{label}</span>
              {NOTE[type] && (
                <span className="block text-[13px] text-muted-foreground">{NOTE[type]}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending} className="cursor-pointer">
        {pending ? "Saving..." : "Save required items"}
      </Button>
    </form>
  );
}
