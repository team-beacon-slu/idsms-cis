import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { confirmPassword } from "@/lib/auth/confirmPassword";
import { generateBulkEndorsementLetters } from "@/lib/services/reports/documentService";
import { notifyEndorsementReady } from "@/lib/services/notifications/notificationEvents";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BULK = 40;

// FR-DG-02 bulk export; NFR-SEC-05 re-authentication via password re-entry.
export async function POST(req: NextRequest, props: { params: Promise<{ classGroupId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);

    const body = await req.json();
    const denied = await confirmPassword(user, body?.password, req.headers.get("x-forwarded-for"));
    if (denied) return denied;

    // A faculty adviser only reaches the semesters they advise this group
    // for — the same (classGroup, semester) rule as assertCanAccessStudent.
    let semesterIds: string[] | undefined;
    if (user.role === Role.FACULTY_ADVISER) {
      const links = await prisma.facultyClassGroup.findMany({
        where: { facultyId: user.id, classGroupId: params.classGroupId },
        select: { semesterId: true },
      });
      if (links.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      semesterIds = links.map((l) => l.semesterId);
    }

    const count = await prisma.studentProfile.count({
      where: {
        classGroupId: params.classGroupId,
        deletedAt: null,
        ...(semesterIds ? { semesterId: { in: semesterIds } } : {}),
      },
    });
    if (count > MAX_BULK) {
      return NextResponse.json(
        {
          error: `This class group has ${count} students; bulk generation is limited to ${MAX_BULK} per request`,
        },
        { status: 400 }
      );
    }

    const result = await generateBulkEndorsementLetters(params.classGroupId, user.id, semesterIds);
    // FR-NT-01 #7 for every newly generated letter (never throws). After the
    // response: PDF generation already uses most of the time budget.
    waitUntil(
      (async () => {
        for (const { studentProfileId } of result.generated) {
          await notifyEndorsementReady(studentProfileId);
        }
      })()
    );
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
