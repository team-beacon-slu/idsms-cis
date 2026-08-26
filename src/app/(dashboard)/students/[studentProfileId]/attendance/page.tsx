import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { assertCanAccessStudent, ForbiddenError } from "@/lib/services/userService";
import { listDeviationReportsForStudent } from "@/lib/services/attendanceService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendanceScheduleForm } from "./schedule-form";
import { DeviationReportForm } from "./deviation-form";
import { AttendanceExportButton } from "./export-button";

export default async function AttendancePage({ params }: { params: { studentProfileId: string } }) {
  const user = await requireUserPage();

  try {
    await assertCanAccessStudent(user, params.studentProfileId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/");
    }
    throw error;
  }

  const deviationReports = await listDeviationReportsForStudent(params.studentProfileId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Attendance & Schedule
            <AttendanceExportButton studentProfileId={params.studentProfileId} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceScheduleForm studentProfileId={params.studentProfileId} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deviation Reports ({deviationReports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DeviationReportForm studentProfileId={params.studentProfileId} />
        </CardContent>
      </Card>
    </div>
  );
}
