import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import {
  colorCodeCalendarEvents,
  getUnifiedCalendarEvents,
  getFacultyCalendarView,
} from "@/lib/services/calendarService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

export const dynamic = "force-dynamic";

// FR-CAL-01: any authenticated user, role-scoped inside getUnifiedCalendarEvents.
export async function GET() {
  try {
    const user = await requireUserApi();
    const events =
      user.role === Role.FACULTY_ADVISER
        ? await getFacultyCalendarView(user.id)
        : await getUnifiedCalendarEvents(user.id, user.role);
    return NextResponse.json({ events: colorCodeCalendarEvents(events) });
  } catch (error) {
    return handleApiError(error);
  }
}
