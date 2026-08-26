import { requireUserPage } from "@/lib/auth/session";
import { colorCodeCalendarEvents, getUnifiedCalendarEvents } from "@/lib/services/calendarService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCalendarView } from "./unified-calendar-view";

export default async function CalendarPage() {
  const user = await requireUserPage();
  const events = colorCodeCalendarEvents(await getUnifiedCalendarEvents(user.id, user.role));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendar</CardTitle>
      </CardHeader>
      <CardContent>
        <UnifiedCalendarView events={events} />
      </CardContent>
    </Card>
  );
}
