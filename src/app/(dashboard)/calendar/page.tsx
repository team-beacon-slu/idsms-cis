import { CalendarDays } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { colorCodeCalendarEvents, getUnifiedCalendarEvents } from "@/lib/services/calendarService";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCalendarView } from "./unified-calendar-view";

export default async function CalendarPage() {
  const user = await requireUserPage();
  const events = colorCodeCalendarEvents(await getUnifiedCalendarEvents(user.id, user.role));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <CalendarDays className="size-6 text-primary" aria-hidden="true" />
          Calendar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deadlines, holidays, and OJT milestones for your role.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">This semester</CardTitle>
          <CardDescription>Color-coded by event type — see the legend below.</CardDescription>
        </CardHeader>
        <CardContent>
          <UnifiedCalendarView events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
