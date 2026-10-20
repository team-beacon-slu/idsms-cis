import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { addDailyEntry } from "@/lib/services/weeklyReportService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { handleApiError } from "@/lib/utils/apiError";

const bodySchema = z.object({ reportDate: z.coerce.date() });

// Workstream L1: add a non-scheduled day (e.g. a Saturday worked as OT) to a
// weekly report. Ownership, editability and the date checks live in the service.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.STUDENT_INTERN]);
    const { reportDate } = bodySchema.parse(await req.json());
    const entry = await addDailyEntry(params.id, reportDate, user.id);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
