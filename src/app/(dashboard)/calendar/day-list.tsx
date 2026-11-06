"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Day = { id: string; date: string; name: string };

// The coordinator's dated lists on Calendar: company days off (with a company picker; only
// that company's interns get the day) and department events (on everyone's calendar).
export function DayList({
  id,
  endpoint,
  days,
  nameLabel,
  placeholder,
  addedMessage,
  removedMessage,
  companies,
}: {
  id: string;
  endpoint: string;
  days: Day[];
  nameLabel: string;
  placeholder: string;
  addedMessage: string;
  removedMessage: string;
  companies?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
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
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companies ? { companyId, date, name } : { date, name }),
      },
      addedMessage
    );
    if (saved) {
      setDate("");
      setName("");
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={add}
        className={
          companies
            ? "grid gap-3 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end"
            : "grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
        }
      >
        {companies && (
          <div className="space-y-2">
            <Label htmlFor={`${id}-company`}>Company</Label>
            <select
              id={`${id}-company`}
              required
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="flex h-10 w-full cursor-pointer rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">Choose a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor={`${id}-date`}>Date</Label>
          <Input
            id={`${id}-date`}
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-name`}>{nameLabel}</Label>
          <Input
            id={`${id}-name`}
            required
            maxLength={120}
            placeholder={placeholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          Add
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
                onClick={() => send(`${endpoint}/${d.id}`, { method: "DELETE" }, removedMessage)}
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
