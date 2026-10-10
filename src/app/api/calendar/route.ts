import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  colorCodeCalendarEvents,
  detectHighVolumeSubmissionWeeks,
  getFacultyCalendarView,
  getUnifiedCalendarEvents,
} from "@/lib/services/calendarService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export const dynamic = "force-dynamic";

// FR-CAL-01: any authenticated user, role-scoped inside getUnifiedCalendarEvents.
// FR-CAL-03: faculty get their aggregated view plus high-volume submission weeks.
export async function GET() {
  try {
    const user = await requireUserApi();
    const isFaculty = user.role === Role.FACULTY_ADVISER;
    const events = isFaculty
      ? await getFacultyCalendarView(user.id)
      : await getUnifiedCalendarEvents(user.id, user.role);
    const highVolumeWeeks = isFaculty ? await detectHighVolumeSubmissionWeeks(user.id) : [];
    return NextResponse.json({ events: colorCodeCalendarEvents(events), highVolumeWeeks });
  } catch (error) {
    return handleApiError(error);
  }
}
