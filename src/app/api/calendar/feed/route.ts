import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getCoordinatorCalendarView,
  getFacultyCalendarView,
  getStudentCalendarView,
} from "@/lib/services/calendar/calendarService";
import { toIcs, verifyFeedToken } from "@/lib/calendar/icsFeed";

export const dynamic = "force-dynamic";

// GET /api/calendar/feed?u=<userId>&t=<signature>: the viewer's calendar as .ics for a phone
// calendar subscription. No session (calendar apps send none): the signature is the credential,
// and a deactivated or deleted account gets nothing.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u") ?? "";
  const token = req.nextUrl.searchParams.get("t") ?? "";
  if (!userId || !token || !verifyFeedToken(userId, token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { id: true, role: true, studentProfile: { select: { id: true } } },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const events =
    user.role === Role.STUDENT_INTERN
      ? user.studentProfile
        ? await getStudentCalendarView(user.studentProfile.id)
        : []
      : user.role === Role.FACULTY_ADVISER
        ? await getFacultyCalendarView(user.id)
        : await getCoordinatorCalendarView(user.id);

  return new NextResponse(toIcs(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="idsms.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
