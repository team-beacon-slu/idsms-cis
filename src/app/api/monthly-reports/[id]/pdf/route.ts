import { NextRequest, NextResponse } from "next/server";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserApi } from "@/lib/auth/session";
import { assertCanAccessStudent } from "@/lib/services/accounts/userService";
import {
  generateMonthlyReportPdf,
  getGeneratedDocumentDownloadUrl,
} from "@/lib/services/reports/documentService";
import { handleApiError } from "@/lib/utils/apiError";
import { sluFileName } from "@/lib/documents/slu";
import { displayNameFromEmail } from "@/lib/utils/displayName";

export const runtime = "nodejs";
export const maxDuration = 120;

async function loadAccessibleMonthlyDoc(id: string) {
  const user = await requireUserApi();
  const doc = await prisma.generatedDocument.findUnique({ where: { id } });
  if (!doc || doc.documentType !== DocumentType.MONTHLY_REPORT) return { user, doc: null };
  await assertCanAccessStudent(user, doc.studentProfileId);
  return { user, doc };
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { doc } = await loadAccessibleMonthlyDoc(params.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (doc.status !== "GENERATED") {
      return NextResponse.json(
        { error: "PDF not generated yet", status: doc.status },
        { status: 404 }
      );
    }
    const profile = await prisma.studentProfile.findUnique({
      where: { id: doc.studentProfileId },
      select: { fullName: true, user: { select: { email: true } } },
    });
    const name = profile && (profile.fullName?.trim() || displayNameFromEmail(profile.user.email));
    const fileName = name && sluFileName({ kind: "JLE", month: doc.periodLabel ?? "" }, name);
    return NextResponse.redirect(await getGeneratedDocumentDownloadUrl(doc, fileName || undefined));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user, doc } = await loadAccessibleMonthlyDoc(params.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await generateMonthlyReportPdf(doc.id, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
