import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  colorCodeCalendarEvents,
  detectEndorsementLetterSpikes,
  detectHighVolumeSubmissionWeeks,
  getCoordinatorCalendarView,
  getFacultyCalendarView,
  getUnifiedCalendarEvents,
} from "@/lib/services/calendar/calendarService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export const dynamic = "force-dynamic";

// FR-CAL-01: any authenticated user, role-scoped inside getUnifiedCalendarEvents.
// FR-CAL-03: faculty get their aggregated view plus high-volume submission weeks.
// FR-CAL-04: coordinators/admins get the department view plus endorsement-letter spikes.
export async function GET() {
  try {
    const user = await requireUserApi();
    const isFaculty = user.role === Role.FACULTY_ADVISER;
    const isCoordinatorView =
      user.role === Role.DEPARTMENT_COORDINATOR || user.role === Role.SUPER_ADMIN;

    const events = isFaculty
      ? await getFacultyCalendarView(user.id)
      : isCoordinatorView
        ? await getCoordinatorCalendarView(user.id)
        : await getUnifiedCalendarEvents(user.id, user.role);
    // Reuse the view just built instead of rebuilding it per detector.
    const highVolumeWeeks = isFaculty ? await detectHighVolumeSubmissionWeeks(user.id, events) : [];
    const endorsementSpikes = isCoordinatorView
      ? await detectEndorsementLetterSpikes(user.id, events)
      : [];

    return NextResponse.json({
      events: colorCodeCalendarEvents(events),
      highVolumeWeeks,
      endorsementSpikes,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
