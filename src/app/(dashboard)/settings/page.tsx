import { redirect } from "next/navigation";
import { ChecklistRequirementType, Program, Role } from "@prisma/client";
import { requireUserPage } from "@/lib/auth/session";
import { getAiSettings } from "@/lib/ai/settings";
import { getRequiredHoursConfig } from "@/lib/services/attendanceService";
import { getRequiredChecklistTypes } from "@/lib/services/checklistService";
import { getDeductionMatrix, getDefaultConductHours } from "@/lib/services/deductionService";
import { getNotificationSettings } from "@/lib/services/scheduledNotifications";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirementLabel } from "@/app/(dashboard)/student-dashboard";
import { NotificationSettingsForm } from "../users/notification-settings-form";
import { RequiredHoursForm } from "../users/required-hours-form";
import { ChecklistSettingsForm } from "../users/checklist-settings-form";
import { AiSettingsForm } from "../users/ai-settings-form";
import { DeductionSettingsForm } from "../users/deduction-settings-form";

// System settings, one view of their own (they used to sit above the account list on
// Users, which pushed that page's main job to the bottom). Super Admin only.
export default async function SettingsPage() {
  const user = await requireUserPage();
  if (user.role !== Role.SUPER_ADMIN) redirect("/");

  const [notificationSettings, requiredHours, aiSettings, matrix, defaultHours, required] =
    await Promise.all([
      getNotificationSettings(),
      Promise.all(
        Object.values(Program).map(async (program) => ({
          program,
          hours: await getRequiredHoursConfig(program),
        }))
      ),
      getAiSettings(),
      getDeductionMatrix(),
      getDefaultConductHours(),
      getRequiredChecklistTypes(),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Department-wide rules: what interns need, how hours count, and what IDSMS sends."
      />

      {/* Masonry columns: settings cards differ in height, so they stack without ragged rows. */}
      <div className="gap-6 xl:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-brand-900">Checklist requirements</CardTitle>
            <CardDescription>
              Which pre-deployment items must be approved before an endorsement letter. Unticked
              items stay on interns&apos; checklists as optional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChecklistSettingsForm
              items={Object.values(ChecklistRequirementType).map((type) => ({
                type,
                label: requirementLabel(type),
              }))}
              initial={required}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-brand-900">Required internship hours</CardTitle>
              <CardDescription>
                Hours each program must complete. Sets the default for students imported after you
                save. Existing students keep their current required hours.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RequiredHoursForm initial={requiredHours} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-brand-900">Notifications</CardTitle>
              <CardDescription>
                Deadline reminders and MOA expiry warnings sent by the daily job.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationSettingsForm initial={notificationSettings} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-brand-900">Deductions</CardTitle>
            <CardDescription>
              SLU&apos;s deduction matrix and the hours a conduct record deducts. Changes apply to
              every intern&apos;s tally right away.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeductionSettingsForm matrix={matrix} defaultHours={defaultHours} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-brand-900">AI advisories</CardTitle>
            <CardDescription>
              Advisory-only similarity and sentiment signals on weekly reports (PRD Module 9). Off
              until the adviser approves the privacy basis and the golden-set evaluation passes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiSettingsForm settings={aiSettings} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
