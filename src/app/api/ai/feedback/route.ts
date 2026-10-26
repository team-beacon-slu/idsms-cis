import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { JOB_IDS, rateHint, type JobId } from "@/lib/ai/jobs";
import { handleApiError } from "@/lib/utils/apiError";

const schema = z.object({
  job: z.enum(JOB_IDS as [JobId, ...JobId[]]),
  targetId: z.string().trim().min(1).max(200),
  correct: z.boolean(),
});

// R2: staff rate a hint Correct / Not right. The rating only counts toward switching the
// job off; it never changes the report.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const { job, targetId, correct } = schema.parse(await req.json());
    await rateHint(job, targetId, correct, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
