"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

// FR-AT-02 — the student-facing side of getHolidayCalendarForStudent /
// markHolidayApplicable. A holiday marked "Working day" is one the host
// company doesn't observe: weekly report forms then include it as a regular
// scheduled day instead of skipping it.

export interface HolidayRow {
  id: string;
  date: string; // ISO
  name: string;
  applicable: boolean;
}

export function HolidayList({
  studentProfileId,
  holidays,
  canEdit,
}: {
  studentProfileId: string;
  holidays: HolidayRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggle(holiday: HolidayRow) {
    setPendingId(holiday.id);
    const res = await fetch(`/api/students/${studentProfileId}/holidays`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holidayEntryId: holiday.id, applicable: !holiday.applicable }),
    });
    setPendingId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Failed to update holiday");
      return;
    }
    toast.success(
      holiday.applicable ? `${holiday.name} marked as a working day` : `${holiday.name} restored`
    );
    router.refresh();
  }

  if (holidays.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        <PartyPopper className="size-6" aria-hidden="true" />
        <p>No holidays have been published for this semester yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {holidays.map((holiday) => (
        <li key={holiday.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-medium",
                holiday.applicable ? "text-foreground" : "text-muted-foreground line-through"
              )}
            >
              {holiday.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(holiday.date).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </p>
          </div>
          {canEdit ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={holiday.applicable}
                disabled={pendingId === holiday.id}
                onChange={() => toggle(holiday)}
                className="size-4 cursor-pointer accent-primary"
              />
              {holiday.applicable ? "Day off" : "Working day"}
            </label>
          ) : (
            <span className="text-xs text-muted-foreground">
              {holiday.applicable ? "Day off" : "Working day"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
