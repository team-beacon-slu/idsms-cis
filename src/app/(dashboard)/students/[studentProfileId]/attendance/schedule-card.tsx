import type { ReactNode } from "react";
import type { Role } from "@prisma/client";
import {
  getLatestScheduleChangeStatus,
  type ScheduleChangeHistoryEntry,
} from "@/lib/services/attendance/attendanceService";
import { parseScheduleConfig } from "@/lib/utils/schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceScheduleForm, type PendingScheduleChange } from "./schedule-form";

// The intern's work schedule: the week's working days and hours, set once the work plan is
// approved and changed only with approval. It belongs to the work plan, so it shows on the
// Work plan page (where the faculty adviser looked for it, Nov 2026) and on Attendance.
export function ScheduleCard({
  studentProfileId,
  role,
  workPlan,
  action,
}: {
  studentProfileId: string;
  role: Role;
  // The latest approved work plan, which holds the schedule.
  workPlan: { id: string; scheduleConfig: unknown; scheduleChangeHistory: unknown } | null;
  action?: ReactNode;
}) {
  const currentSchedule = parseScheduleConfig(workPlan?.scheduleConfig);
  const changeHistory = (workPlan?.scheduleChangeHistory ?? []) as ScheduleChangeHistoryEntry[];
  const latestChangeStatus = getLatestScheduleChangeStatus(changeHistory);
  const pendingRequest =
    latestChangeStatus === "PENDING_FACULTY" || latestChangeStatus === "PENDING_COORDINATOR"
      ? [...changeHistory].reverse().find((entry) => entry.action === "REQUESTED")
      : undefined;
  const pendingChange: PendingScheduleChange | null =
    pendingRequest && latestChangeStatus
      ? {
          status: latestChangeStatus,
          requestedAt: pendingRequest.timestamp,
          reason: String(pendingRequest.reason ?? ""),
          newScheduleConfig: parseScheduleConfig(pendingRequest.newScheduleConfig) ?? {
            daysOfWeek: [],
            hoursPerDay: 0,
          },
        }
      : null;

  return (
    <Card id="schedule" className="scroll-mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Work schedule</CardTitle>
            <CardDescription>
              The working days and hours for the semester, set with the work plan. A change needs
              the faculty adviser&apos;s and the coordinator&apos;s approval.
            </CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>
        <AttendanceScheduleForm
          studentProfileId={studentProfileId}
          workPlanApproved={workPlan != null}
          currentSchedule={currentSchedule}
          pendingChange={pendingChange}
          canEdit={role === "STUDENT_INTERN"}
          review={
            workPlan && pendingChange?.status === "PENDING_FACULTY" && role === "FACULTY_ADVISER"
              ? { workPlanId: workPlan.id, stage: "faculty" }
              : workPlan &&
                  pendingChange?.status === "PENDING_COORDINATOR" &&
                  (role === "DEPARTMENT_COORDINATOR" || role === "SUPER_ADMIN")
                ? { workPlanId: workPlan.id, stage: "coordinator" }
                : null
          }
        />
      </CardContent>
    </Card>
  );
}
