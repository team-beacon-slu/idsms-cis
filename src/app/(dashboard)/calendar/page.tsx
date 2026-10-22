import { Clock3 } from "lucide-react";
import { Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  colorCodeCalendarEvents,
  detectEndorsementLetterSpikes,
  detectHighVolumeSubmissionWeeks,
  getCoordinatorCalendarView,
  getFacultyCalendarView,
  getStudentCalendarView,
  getUnifiedCalendarEvents,
} from "@/lib/services/calendarService";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/workPlanService";
import { formatSchedule, parseScheduleConfig } from "@/lib/utils/schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCalendarView } from "./unified-calendar-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calendar" };

function formatWeek(weekStart: Date) {
  return weekStart.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function CalendarPage() {
  const user = await requireUserPage();
  const isFaculty = user.role === Role.FACULTY_ADVISER;
  const coordinatorView =
    user.role === Role.DEPARTMENT_COORDINATOR || user.role === Role.SUPER_ADMIN;
  // Each role gets its own scoped view: students (FR-CAL-02), faculty
  // (FR-CAL-03), coordinators/admins (FR-CAL-04).
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
  } else if (isFaculty) {
    events = await getFacultyCalendarView(user.id);
  } else if (coordinatorView) {
    events = await getCoordinatorCalendarView(user.id);
  } else {
    events = colorCodeCalendarEvents(await getUnifiedCalendarEvents(user.id, user.role));
  }
  // Reuse the view just built: rebuilding it per detector doubled the page's queries.
  const highVolumeWeeks = isFaculty ? await detectHighVolumeSubmissionWeeks(user.id, events) : [];
  const endorsementSpikes = coordinatorView
    ? await detectEndorsementLetterSpikes(user.id, events)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Calendar</h1>
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

      {isFaculty && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <h2 className="font-medium">High submission volume</h2>
          {highVolumeWeeks.length ? (
            <ul className="mt-2 space-y-1">
              {highVolumeWeeks.map(({ weekStart, count }) => (
                <li key={weekStart.toISOString()}>
                  Week of {formatWeek(weekStart)}: {count} submissions expected
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">No weeks exceed the submission threshold.</p>
          )}
        </div>
      )}

      {coordinatorView && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <h2 className="font-medium">Expected endorsement letter demand</h2>
          {endorsementSpikes.length ? (
            <ul className="mt-2 space-y-1">
              {endorsementSpikes.map(({ weekStart, expectedCount }) => (
                <li key={weekStart.toISOString()}>
                  Week of {formatWeek(weekStart)}: {expectedCount} projected completions
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
          <CardDescription>
            Each kind of event has its own colour; the key sits above the month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnifiedCalendarView events={events} role={user.role} />
        </CardContent>
      </Card>
    </div>
  );
}
