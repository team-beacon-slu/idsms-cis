"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarX2 } from "lucide-react";
import type { CalendarEvent, CalendarEventType } from "@/lib/services/calendar/calendarService";
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
  red: "border-red-200 bg-red-50 text-red-700",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  green: "border-green-200 bg-green-50 text-green-700",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Normalize calendar dates in Manila, regardless of the browser/server time zone.
function manilaDateKey(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function displayDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return date.toLocaleDateString("en-PH", { ...options, timeZone: "UTC" });
}
function buildMonthGrid(monthDate: Date): Date[] {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(year, month, 1 - offset + i)));
}
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
      <CalendarX2 className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">No events this month.</p>
    </div>
  );
}
function EventList({ events, staff }: { events: CalendarEvent[]; staff: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {events.map((event, index) => (
        <li
          key={`${event.type}-${event.studentProfileId ?? ""}-${event.date.toISOString()}-${index}`}
          className="flex items-start gap-3 px-4 py-3"
        >
          <span
            className={cn("mt-1 size-2 shrink-0 rounded-full", DOT_CLASSES[TYPE_TONE[event.type]])}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium wrap-break-word text-foreground">{event.label}</p>
            <p className="text-xs text-muted-foreground">
              {displayDate(new Date(`${manilaDateKey(event.date)}T00:00:00Z`), {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              · {TYPE_LABEL[event.type]}
            </p>
            {staff && event.studentProfileId && (
              <a
                href={`/students/${event.studentProfileId}/weekly-reports`}
                className="text-xs text-primary underline underline-offset-2"
              >
                Student reports
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
export function UnifiedCalendarView({
  events,
  role = "STUDENT_INTERN",
}: {
  events: CalendarEvent[];
  role?: import("@prisma/client").Role;
}) {
  const [monthCursor, setMonthCursor] = useState(() => {
    const key = manilaDateKey(new Date());
    return new Date(`${key.slice(0, 7)}-01T00:00:00Z`);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const sortedEvents = useMemo(
    () =>
      events
        .map((event) => ({ ...event, date: new Date(event.date) }))
        .filter((event) => !Number.isNaN(event.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [events]
  );
  const eventsByDay = useMemo(() => {
    const index = new Map<string, CalendarEvent[]>();
    for (const event of sortedEvents) {
      const key = manilaDateKey(event.date);
      const dayEvents = index.get(key);
      if (dayEvents) dayEvents.push(event);
      else index.set(key, [event]);
    }
    return index;
  }, [sortedEvents]);
  const monthKey = monthCursor.toISOString().slice(0, 7);
  const monthEvents = sortedEvents.filter((event) =>
    manilaDateKey(event.date).startsWith(monthKey)
  );
  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);
  const todayKey = manilaDateKey(new Date());
  const monthLabel = displayDate(monthCursor, { month: "long", year: "numeric" });
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];
  const staff = role !== "STUDENT_INTERN";
  const completion = !staff ? sortedEvents.find((event) => event.type === "COMPLETION") : undefined;
  const changeMonth = (offset: number) => {
    setMonthCursor(
      (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
    );
    setSelectedDay(null);
  };
  const controlClass =
    "rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div data-testid="unified-calendar-view" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {role === "STUDENT_INTERN"
          ? "Your internship calendar"
          : role === "FACULTY_ADVISER"
            ? "Assigned students’ calendar"
            : "Department calendar"}{" "}
        · Asia/Manila
      </p>
      {completion && (
        <div className={cn("rounded-lg border p-4", CHIP_CLASSES.green)}>
          <p className="text-xs font-medium">Projected OJT completion date</p>
          <p className="mt-1 font-semibold">
            {displayDate(new Date(`${manilaDateKey(completion.date)}T00:00:00Z`), {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Event legend">
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
      {/* Shared toolbar keeps month navigation available on mobile. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className={controlClass}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <h2 className="text-sm font-semibold text-foreground" aria-live="polite">
          {monthLabel}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(controlClass, "text-xs")}
            onClick={() => {
              setMonthCursor(new Date(`${todayKey.slice(0, 7)}-01T00:00:00Z`));
              setSelectedDay(null);
            }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            className={controlClass}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="hidden sm:block" role="group" aria-label="Month calendar">
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
            const key = day.toISOString().slice(0, 10);
            const dayEvents = eventsByDay.get(key) ?? [];
            const inMonth = day.getUTCMonth() === monthCursor.getUTCMonth();
            const isToday = key === todayKey;
            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelectedDay(key)}
                aria-label={`View ${dayEvents.length} events for ${displayDate(day, { month: "long", day: "numeric", year: "numeric" })}`}
                aria-expanded={selectedDay === key}
                aria-controls="calendar-day-details"
                aria-current={isToday ? "date" : undefined}
                className={cn(
                  "flex min-h-24 min-w-0 flex-col items-stretch justify-start bg-card p-1.5 text-left focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
                  !inMonth && "bg-muted/20",
                  selectedDay === key && "ring-2 ring-primary ring-inset"
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                    inMonth ? "text-foreground" : "text-muted-foreground/50",
                    isToday && "bg-chart-1 font-semibold text-white"
                  )}
                >
                  {day.getUTCDate()}
                </span>
                <span className="mt-1 block space-y-0.5">
                  {dayEvents.slice(0, 3).map((event, index) => (
                    <span
                      key={index}
                      className={cn(
                        "block truncate rounded px-1 py-0.5 text-[10px]",
                        CHIP_CLASSES[TYPE_TONE[event.type]]
                      )}
                    >
                      {event.label}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="block px-1 text-[10px] text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {selectedDay && (
          <section
            id="calendar-day-details"
            aria-label="Day details"
            aria-live="polite"
            className="mt-4 space-y-2"
          >
            <h3 className="text-sm font-medium">
              {displayDate(new Date(`${selectedDay}T00:00:00Z`), {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h3>
            {selectedEvents.length ? (
              <EventList events={selectedEvents} staff={staff} />
            ) : (
              <p className="text-sm text-muted-foreground">No events on this date.</p>
            )}
          </section>
        )}
      </div>
      <section aria-label="Month agenda" className="sm:hidden">
        {monthEvents.length ? <EventList events={monthEvents} staff={staff} /> : <EmptyState />}
      </section>
      {monthEvents.length === 0 && (
        <p className="hidden text-sm text-muted-foreground sm:block">No events this month.</p>
      )}
    </div>
  );
}
