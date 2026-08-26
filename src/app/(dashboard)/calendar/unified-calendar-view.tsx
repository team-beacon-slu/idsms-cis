"use client";

import type { CalendarEvent } from "@/lib/services/calendarService";

// FR-CAL-01–04 — Owner: gu457 (Ulrich)
// Requirement: the shared color-coded calendar grid, rendered for all four
// roles.
// Connects to: the `events` prop is already fetched and color-coded by the
// server page shell (`calendar/page.tsx`, same task) via
// `calendarService.getUnifiedCalendarEvents` +
// `colorCodeCalendarEvents` (Task 7) — this component is purely
// presentational, it does not fetch. `CalendarEvent.color` (already set:
// red/gray/yellow/green per FR-CAL-01) drives the visual styling;
// `CalendarEvent.type`/`date`/`label` drive placement and content.
// Edge cases: an empty `events` array (new semester, nothing scheduled yet)
// should render an empty grid, not an error state.
export function UnifiedCalendarView({ events }: { events: CalendarEvent[] }) {
  return (
    <div data-testid="unified-calendar-view" className="text-sm text-muted-foreground">
      {events.length} calendar events — grid not yet implemented (see issue #43).
    </div>
  );
}
