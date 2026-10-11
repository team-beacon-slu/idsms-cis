"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { program: string; hours: number };

// FR-AT-06: Super Admin sets required internship hours per program. Mirrors
// requiredHoursConfigSchema (positive whole number); only changed programs
// are PATCHed, one request each.
export function RequiredHoursForm({ initial }: { initial: Row[] }) {
  const [saved, setSaved] = useState<Record<string, number>>(
    Object.fromEntries(initial.map((r) => [r.program, r.hours]))
  );
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((r) => [r.program, String(r.hours)]))
  );
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const changed: Row[] = [];
    for (const { program } of initial) {
      const text = values[program].trim();
      const hours = Number(text);
      if (text === "" || !Number.isInteger(hours) || hours <= 0) {
        toast.error(`${program}: enter a positive whole number of hours`);
        return;
      }
      if (hours !== saved[program]) changed.push({ program, hours });
    }
    if (changed.length === 0) {
      toast.info("No changes to save");
      return;
    }
    setIsPending(true);
    try {
      for (const { program, hours } of changed) {
        const res = await fetch("/api/config/required-hours", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ program, hours }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error ?? `Could not save ${program}`);
          continue;
        }
        setSaved((s) => ({ ...s, [program]: hours }));
        toast.success(`${program} required hours saved`);
      }
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[repeat(3,1fr)_auto] sm:items-end">
      {initial.map(({ program }) => (
        <div key={program} className="space-y-2">
          <Label htmlFor={`required-hours-${program}`}>{program} required hours</Label>
          <Input
            id={`required-hours-${program}`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={values[program]}
            onChange={(e) => setValues((v) => ({ ...v, [program]: e.target.value }))}
          />
        </div>
      ))}
      <Button
        type="submit"
        disabled={isPending}
        className="cursor-pointer disabled:cursor-not-allowed"
      >
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
