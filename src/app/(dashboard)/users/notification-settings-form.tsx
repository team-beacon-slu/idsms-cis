"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// FR-NT-02: Super Admin sets how many hours before a weekly-report deadline
// students are reminded, and how many days ahead MOA expiry is flagged.
export function NotificationSettingsForm({
  initial,
}: {
  initial: { deadlineReminderHours: number[]; moaWarningDays: number };
}) {
  const [hours, setHours] = useState(initial.deadlineReminderHours.join(", "));
  const [moaDays, setMoaDays] = useState(String(initial.moaWarningDays));
  const [isPending, setIsPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const deadlineReminderHours = hours
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
      .map(Number);
    if (deadlineReminderHours.some(Number.isNaN) || Number.isNaN(Number(moaDays))) {
      toast.error("Use whole numbers only, e.g. 48, 24");
      return;
    }
    setIsPending(true);
    try {
      const res = await fetch("/api/config/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadlineReminderHours, moaWarningDays: Number(moaDays) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.issues?.[0]?.message ?? body.error ?? "Could not save the settings");
        return;
      }
      toast.success("Notification settings saved");
    } catch {
      toast.error("Could not reach the server — check your connection and try again");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="reminder-hours">Reminder hours before deadline</Label>
        <Input
          id="reminder-hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          inputMode="numeric"
          aria-describedby="reminder-hours-help"
        />
        <p id="reminder-hours-help" className="text-[13px] text-muted-foreground">
          Up to 3 values, comma-separated (16–168), e.g. 48, 24. The daily job runs at 8 AM, so the
          last chance before the Tuesday 11:59 PM deadline is about 16 hours out.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="moa-days">MOA expiry warning (days)</Label>
        <Input
          id="moa-days"
          type="number"
          min={1}
          max={180}
          value={moaDays}
          onChange={(e) => setMoaDays(e.target.value)}
        />
        <p className="text-[13px] text-muted-foreground">1–180 days ahead</p>
      </div>
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
