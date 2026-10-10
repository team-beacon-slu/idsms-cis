import { NextResponse } from "next/server";
import {
  colorCodeCalendarEvents,
  getUnifiedCalendarEvents,
  getCoordinatorCalendarView,
  detectEndorsementLetterSpikes,
} from "@/lib/services/calendarService";
import { Role } from "@prisma/client";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-CAL-01: any authenticated user, role-scoped inside getUnifiedCalendarEvents.
export async function GET() {
  try {
    const user = await requireUserApi();
    const coordinatorView =
      user.role === Role.DEPARTMENT_COORDINATOR || user.role === Role.SUPER_ADMIN;
    const events = coordinatorView
      ? await getCoordinatorCalendarView(user.id)
      : await getUnifiedCalendarEvents(user.id, user.role);
    const endorsementSpikes = coordinatorView ? await detectEndorsementLetterSpikes(user.id) : [];
    return NextResponse.json({ events: colorCodeCalendarEvents(events), endorsementSpikes });
  } catch (error) {
    return handleApiError(error);
  }
}
