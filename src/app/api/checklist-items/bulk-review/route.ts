import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Role } from "@prisma/client";
import { z } from "zod";
import { bulkApproveChecklistItems } from "@/lib/services/predeployment/checklistService";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { notifyChecklistReviewed } from "@/lib/services/notifications/notificationEvents";
import { handleApiError } from "@/lib/utils/apiError";

// Approve selected checklist items from the class grid. Returning still happens one item
// at a time, with a note, on the intern's checklist page.
const schema = z.object({ itemIds: z.array(z.uuid()).min(1).max(500) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);
    const { itemIds } = schema.parse(await req.json());
    const result = await bulkApproveChecklistItems(
      [...new Set(itemIds)],
      user,
      req.headers.get("x-forwarded-for")
    );
    // One notice per intern, not one per item.
    const students = [...new Set(result.approved.map((a) => a.studentProfileId))];
    waitUntil(Promise.all(students.map((id) => notifyChecklistReviewed(id, "APPROVE"))));
    return NextResponse.json({ approved: result.approved.length, failed: result.failed });
  } catch (error) {
    return handleApiError(error);
  }
}
