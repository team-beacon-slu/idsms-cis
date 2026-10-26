"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendJson } from "@/lib/utils/sendJson";
import { PartyPopper, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, errorProps } from "@/components/field-error";

// FR-AT-02 — the student-facing side of getHolidayCalendarForStudent /
// markHolidayApplicable. A holiday marked "Working day" is one the host
// company doesn't observe: weekly report forms then include it as a regular
// scheduled day instead of skipping it. Company days are the host company's own
// non-working days, shared by every intern placed there.

export interface HolidayRow {
  id: string;
  date: string; // ISO
  name: string;
  applicable: boolean;
  company: boolean;
  removable: boolean;
}

export function HolidayList({
  studentProfileId,
  holidays,
  canEdit,
  companyName,
}: {
  studentProfileId: string;
  holidays: HolidayRow[];
  canEdit: boolean;
  // The intern's host company; null hides the add form (company days belong to a company).
  companyName: string | null;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const endpoint = `/api/students/${studentProfileId}/holidays`;

  async function toggle(holiday: HolidayRow) {
    setPendingId(holiday.id);
    const res = await sendJson(endpoint, {
      method: "PATCH",
      body: { holidayEntryId: holiday.id, applicable: !holiday.applicable },
    });
    setPendingId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      holiday.applicable ? `${holiday.name} marked as a working day` : `${holiday.name} restored`
    );
    router.refresh();
  }

  async function remove(holiday: HolidayRow) {
    // Removing affects every intern at the company, so it takes a second click.
    if (confirmingId !== holiday.id) return setConfirmingId(holiday.id);
    setPendingId(holiday.id);
    const res = await sendJson(endpoint, {
      method: "DELETE",
      body: { holidayEntryId: holiday.id },
    });
    setPendingId(null);
    setConfirmingId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${holiday.name} removed`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {holidays.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          <PartyPopper className="size-6" aria-hidden="true" />
          <p>No holidays have been published for this semester yet.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {holidays.map((holiday) => (
            <li key={holiday.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p
                  className={cn(
                    "flex flex-wrap items-center gap-2 text-sm font-medium",
                    holiday.applicable ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span className={cn(!holiday.applicable && "line-through")}>{holiday.name}</span>
                  {holiday.company && <Badge variant="secondary">Company</Badge>}
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
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
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
                {holiday.removable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pendingId === holiday.id}
                    onClick={() => remove(holiday)}
                    onBlur={() => setConfirmingId(null)}
                    className="cursor-pointer gap-1 text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {confirmingId === holiday.id ? "Click again to remove" : "Remove"}
                    <span className="sr-only"> {holiday.name}</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {companyName && (
        <AddCompanyDay endpoint={endpoint} companyName={companyName} isIntern={canEdit} />
      )}
    </div>
  );
}

function AddCompanyDay({
  endpoint,
  companyName,
  isIntern,
}: {
  endpoint: string;
  companyName: string;
  isIntern: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<{ date?: string; name?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = {
      date: date ? undefined : "Pick the date",
      name: name.trim().length >= 2 ? undefined : "Name the day, e.g. Chinese New Year",
    };
    setErrors(next);
    if (next.date || next.name) return;
    setPending(true);
    const res = await sendJson(endpoint, { method: "POST", body: { date, name: name.trim() } });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${name.trim()} added for everyone at ${companyName}`);
    setDate("");
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-lg bg-muted/40 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Add a company day off</p>
        <p className="text-sm text-muted-foreground">
          A day {companyName} closes that isn&apos;t a Philippine holiday, like its anniversary or
          Chinese New Year. Every intern placed there gets it.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start">
        <div className="space-y-1.5">
          <Label htmlFor="company-day-date">Date</Label>
          <Input
            id="company-day-date"
            type="date"
            // Interns may add only upcoming days (the server enforces it too); staff can record past ones.
            min={
              isIntern
                ? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
                : undefined
            }
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            {...errorProps("company-day-date", errors.date)}
          />
          <FieldError id="company-day-date-error" message={errors.date} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-day-name">Name</Label>
          <Input
            id="company-day-name"
            value={name}
            maxLength={80}
            placeholder="Company anniversary"
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            {...errorProps("company-day-name", errors.name)}
          />
          <FieldError id="company-day-name-error" message={errors.name} />
        </div>
        <Button type="submit" disabled={pending} className="cursor-pointer gap-1.5 sm:mt-6">
          <Plus className="size-4" aria-hidden="true" />
          {pending ? "Adding..." : "Add day"}
        </Button>
      </div>
    </form>
  );
}
