import { NextResponse } from "next/server";
import { colorCodeCalendarEvents, getUnifiedCalendarEvents } from "@/lib/services/calendarService";
import { requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

// FR-CAL-01: any authenticated user, role-scoped inside getUnifiedCalendarEvents.
export async function GET() {
  try {
    const user = await requireUserApi();
    const events = await getUnifiedCalendarEvents(user.id, user.role);
    return NextResponse.json({ events: colorCodeCalendarEvents(events) });
  } catch (error) {
    return handleApiError(error);
  }
}
