"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarX2 } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/lib/services/calendarService";
import { cn } from "@/lib/utils";

// FR-CAL-01–04 — Owner: gu457 (Ulrich)
// Requirement: the shared color-coded calendar grid, rendered for all four
// roles.
// Connects to: the `events` prop is already fetched and color-coded by the
// server page shell (`calendar/page.tsx`, same task) via
// `calendarService.getUnifiedCalendarEvents` +
// `colorCodeCalendarEvents` (Task 7) — this component is purely
// presentational, it does not fetch. `CalendarEvent.type`/`date`/`label`
// drive placement and content; the tone below is derived from `type` per
// FR-CAL-01's fixed scheme (DEADLINE=red, HOLIDAY=gray, DEVIATION=yellow,
// COMPLETION=green) so styling doesn't depend on `color` being populated.
// Edge cases: an empty `events` array (new semester, nothing scheduled yet)
// renders an empty grid / agenda, not an error state.

type Tone = "red" | "slate" | "amber" | "green";

const TYPE_LABEL: Record<CalendarEventType, string> = {
  DEADLINE: "Submission deadline",
  HOLIDAY: "Holiday",
  DEVIATION: "Approved deviation",
  COMPLETION: "Projected completion",
};

const TYPE_TONE: Record<CalendarEventType, Tone> = {
  DEADLINE: "red",
  HOLIDAY: "slate",
  DEVIATION: "amber",
  COMPLETION: "green",
};

const DOT_CLASSES: Record<Tone, string> = {
  red: "bg-red-500",
  slate: "bg-slate-400",
  amber: "bg-amber-500",
  green: "bg-green-500",
};

const CHIP_CLASSES: Record<Tone, string> = {
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400",
  slate:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  green:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildMonthGrid(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
      <CalendarX2 className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">No events scheduled yet.</p>
    </div>
  );
}

export function UnifiedCalendarView({ events }: { events: CalendarEvent[] }) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const normalizedEvents = useMemo(
    () => events.map((e) => ({ ...e, date: new Date(e.date) })),
    [events]
  );
  const sortedEvents = useMemo(
    () => [...normalizedEvents].sort((a, b) => a.date.getTime() - b.date.getTime()),
    [normalizedEvents]
  );

  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const today = new Date();
  const monthLabel = monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <div data-testid="unified-calendar-view" className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TYPE_LABEL) as CalendarEventType[]).map((type) => (
          <span
            key={type}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium",
              CHIP_CLASSES[TYPE_TONE[type]]
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", DOT_CLASSES[TYPE_TONE[type]])}
              aria-hidden="true"
            />
            {TYPE_LABEL[type]}
          </span>
        ))}
      </div>

      {/* Month grid — sm and up; a 7-column grid rarely fits 375px well, so
          mobile gets the agenda list below instead. */}
      <div className="hidden sm:block">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <p className="text-sm font-semibold text-foreground">{monthLabel}</p>
          <button
            type="button"
            onClick={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            aria-label="Next month"
            className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="bg-muted/50 px-2 py-1.5 text-center font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
          {days.map((day) => {
            const inMonth = day.getMonth() === monthCursor.getMonth();
            const dayEvents = sortedEvents.filter((e) => sameDay(e.date, day));
            const isToday = sameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={cn("min-h-20 bg-card p-1.5", !inMonth && "bg-muted/20")}
              >
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                    inMonth ? "text-foreground" : "text-muted-foreground/50",
                    isToday && "bg-primary font-semibold text-primary-foreground"
                  )}
                >
                  {day.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((event, idx) => (
                    <div
                      key={idx}
                      title={event.label}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px]",
                        CHIP_CLASSES[TYPE_TONE[event.type]]
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          DOT_CLASSES[TYPE_TONE[event.type]]
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{event.label}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda list fallback — below sm */}
      <div className="sm:hidden">
        {sortedEvents.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sortedEvents.map((event, idx) => (
              <li key={idx} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-1 size-2 shrink-0 rounded-full",
                    DOT_CLASSES[TYPE_TONE[event.type]]
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{event.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {event.date.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    · {TYPE_LABEL[event.type]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
