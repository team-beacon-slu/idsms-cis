import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUserApi } from "@/lib/auth/session";
import { verifyCredentials } from "@/lib/services/userService";
import { generateBulkEndorsementLetters } from "@/lib/services/documentService";
import { handleApiError } from "@/lib/utils/apiError";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BULK = 40;
const schema = z.object({ password: z.string().min(1) });

// FR-DG-02 bulk export; NFR-SEC-05 re-authentication via password re-entry.
// verifyCredentials also counts failed attempts, so repeated wrong passwords
// here can lock the account (FR-UM-10) — intended: it's the same credential.
export async function POST(req: NextRequest, { params }: { params: { classGroupId: string } }) {
  try {
    const user = await requireUserApi();
    requireRole(user, [Role.FACULTY_ADVISER, Role.DEPARTMENT_COORDINATOR, Role.SUPER_ADMIN]);

    const { password } = schema.parse(await req.json());
    const auth = await verifyCredentials(user.email, password, req.headers.get("x-forwarded-for"));
    if (!auth.ok) {
      return NextResponse.json({ error: "Password confirmation failed" }, { status: 401 });
    }

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

    return NextResponse.json(
      await generateBulkEndorsementLetters(params.classGroupId, user.id, semesterIds)
    );
  } catch (error) {
    return handleApiError(error);
  }
}
