import { NextResponse } from "next/server";
import { colorCodeCalendarEvents, getUnifiedCalendarEvents } from "@/lib/services/calendarService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";
import { Role } from "@prisma/client";
import { detectHighVolumeSubmissionWeeks } from "@/lib/services/calendarService";

// FR-CAL-01: any authenticated user, role-scoped inside getUnifiedCalendarEvents.
export async function GET() {
  try {
    const user = await requireUserApi();
    const events = await getUnifiedCalendarEvents(user.id, user.role);
    const highVolumeWeeks =
      user.role === Role.FACULTY_ADVISER ? await detectHighVolumeSubmissionWeeks(user.id) : [];
    return NextResponse.json({ events: colorCodeCalendarEvents(events), highVolumeWeeks });
  } catch (error) {
    return handleApiError(error);
  }
}
