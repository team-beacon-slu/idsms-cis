"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Day = { id: string; date: string; name: string };

// Q14: university suspension days count like holidays for every intern this semester.
export function SuspensionDays({ days }: { days: Day[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(url: string, init: RequestInit, ok: string) {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not save");
        return false;
      }
      toast.success(ok);
      router.refresh();
      return true;
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const saved = await send(
      "/api/suspension-days",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, name }),
      },
      "Suspension day added; weekly reports treat it like a holiday"
    );
    if (saved) {
      setDate("");
      setName("");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="suspension-date">Date</Label>
          <Input
            id="suspension-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="suspension-name">Reason</Label>
          <Input
            id="suspension-name"
            required
            maxLength={120}
            placeholder="e.g. Typhoon signal no. 2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          Add day
        </Button>
      </form>
      {days.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {days.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="font-medium">
                  {new Date(d.date).toLocaleDateString("en-PH", {
                    timeZone: "UTC",
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>{" "}
                <span className="text-muted-foreground">{d.name}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  send(
                    `/api/suspension-days/${d.id}`,
                    { method: "DELETE" },
                    "Suspension day removed"
                  )
                }
                className="cursor-pointer text-red-700 disabled:cursor-not-allowed dark:text-red-400"
              >
                Remove<span className="sr-only"> {d.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
