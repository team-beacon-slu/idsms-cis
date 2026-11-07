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
} from "@/lib/services/calendar/calendarService";
import { getLatestApprovedWorkPlanForStudent } from "@/lib/services/predeployment/workPlanService";
import { formatSchedule, parseScheduleConfig } from "@/lib/utils/schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCalendarView } from "./unified-calendar-view";
import { DayList } from "./day-list";
import { FeedLink } from "./feed-link";
import { feedToken } from "@/lib/calendar/icsFeed";
import { listDepartmentEvents } from "@/lib/services/calendar/departmentEventService";
import { listCompanyDays } from "@/lib/services/calendar/companyDaysService";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

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
  const [endorsementSpikes, companyDays, departmentEvents, hostCompanies] = coordinatorView
    ? await Promise.all([
        detectEndorsementLetterSpikes(user.id, events),
        listCompanyDays(),
        listDepartmentEvents(),
        // Companies with interns this semester: the only ones a day off can matter to.
        prisma.company.findMany({
          where: { deletedAt: null, students: { some: { semester: { isActive: true } } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], [], [], []];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Deadlines, holidays, and OJT milestones for your role."
      />

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

      {coordinatorView && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company days off</CardTitle>
            <CardDescription>
              Interns follow their host company&apos;s calendar, not the school&apos;s: an
              anniversary, a company holiday or a work suspension is a day off only for the interns
              placed there. A school suspension reaches only interns whose host company is the
              school. Interns can add upcoming days for their own company too.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayList
              id="company-day"
              endpoint="/api/company-days"
              companies={hostCompanies}
              days={companyDays.map((d) => ({
                id: d.id,
                date: d.date.toISOString(),
                name: `${d.company?.name ?? ""}: ${d.name}`,
              }))}
              nameLabel="Reason"
              placeholder="e.g. Company anniversary"
              addedMessage="Day off added for that company's interns"
              removedMessage="Day off removed"
            />
          </CardContent>
        </Card>
      )}

      {coordinatorView && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Department events</CardTitle>
            <CardDescription>
              Orientations, seminars and other dates every intern and adviser should see. They show
              on everyone&apos;s calendar this semester; they are not days off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayList
              id="department-event"
              endpoint="/api/department-events"
              days={departmentEvents.map((d) => ({
                id: d.id,
                date: d.date.toISOString(),
                name: d.title,
              }))}
              nameLabel="Event"
              placeholder="e.g. Pre-deployment orientation"
              addedMessage="Event added to everyone's calendar"
              removedMessage="Event removed"
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">On your phone: </span>
          see these dates in your own calendar app; it refreshes by itself.
        </p>
        <FeedLink
          url={`${process.env.NEXTAUTH_URL ?? ""}/api/calendar/feed?u=${user.id}&t=${feedToken(user.id)}`}
        />
      </div>

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
