import { CalendarDays, Clock3 } from "lucide-react";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  colorCodeCalendarEvents,
  getStudentCalendarView,
  getUnifiedCalendarEvents,
  getCoordinatorCalendarView,
  detectEndorsementLetterSpikes,
} from "@/lib/services/calendarService";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/workPlanService";
import { formatSchedule, parseScheduleConfig } from "@/lib/utils/schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCalendarView } from "./unified-calendar-view";

export default async function CalendarPage() {
  const user = await requireUserPage();
  const coordinatorView =
    user.role === Role.DEPARTMENT_COORDINATOR || user.role === Role.SUPER_ADMIN;
  const endorsementSpikes = coordinatorView ? await detectEndorsementLetterSpikes(user.id) : [];

  // FR-CAL-02: students get their own scoped view plus their work schedule.
  // Other roles keep the role-scoped aggregate until their dedicated views
  // (FR-CAL-03/04) land.
  let events;
  let scheduleLabel: string | null = null;
  if (user.role === Role.STUDENT_INTERN) {
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    events = studentProfile ? await getStudentCalendarView(studentProfile.id) : [];
    if (studentProfile) {
      const workPlan = await getLatestApprovedWorkPlanForStudent(studentProfile.id);
      const schedule = parseScheduleConfig(workPlan?.scheduleConfig);
      scheduleLabel = schedule ? formatSchedule(schedule) : null;
    }
  } else if (coordinatorView) {
    events = await getCoordinatorCalendarView(user.id);
  } else {
    events = colorCodeCalendarEvents(await getUnifiedCalendarEvents(user.id, user.role));
  }

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

      {user.role === Role.STUDENT_INTERN && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
          <Clock3 className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Work schedule: </span>
            {scheduleLabel ?? "not set yet — configure it on the Attendance page"}
          </p>
        </div>
      )}

      {coordinatorView && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <h2 className="font-medium">Expected endorsement letter demand</h2>
          {endorsementSpikes.length ? (
            <ul className="mt-2 space-y-1">
              {endorsementSpikes.map(({ weekStart, expectedCount }) => (
                <li key={weekStart.toISOString()}>
                  Week of{" "}
                  {weekStart.toLocaleDateString("en-PH", {
                    timeZone: "Asia/Manila",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  : {expectedCount} projected completions
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">No clustered completion weeks detected.</p>
          )}
        </div>
      )}

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
