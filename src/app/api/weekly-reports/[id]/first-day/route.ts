import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { setFirstDayOfOjt } from "@/lib/services/reports/weeklyReportService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const bodySchema = z.object({ firstDay: z.coerce.date() });

// The intern's first day of OJT, set from their first weekly report: the days of that week
// before it leave the report (not yet started). Ownership, editability and the date checks
// live in the service.
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { firstDay } = bodySchema.parse(await req.json());
    await setFirstDayOfOjt(params.id, firstDay, user.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
