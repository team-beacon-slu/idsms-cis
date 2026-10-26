import { prisma } from "@/lib/prisma";
import type { MonthlyReportDocumentData } from "@/lib/documents/monthlyReportTemplate";
import { displayNameFromEmail } from "@/lib/utils/displayName";

// The month's Journal on Learning Experience: the intern's narrative and office.
export async function loadMonthlyReportDocumentData(
  generatedDocumentId: string,
  referenceCode: string
): Promise<MonthlyReportDocumentData | null> {
  const doc = await prisma.generatedDocument.findUnique({
    where: { id: generatedDocumentId },
    select: {
      id: true,
      periodLabel: true,
      studentProfileId: true,
      studentProfile: {
        select: { fullName: true, office: true, user: { select: { email: true } } },
      },
    },
  });
  if (!doc?.periodLabel) return null;

  const journal = await prisma.learningJournal.findUnique({
    where: {
      studentProfileId_month: { studentProfileId: doc.studentProfileId, month: doc.periodLabel },
    },
    select: { narrative: true },
  });
  const profile = doc.studentProfile;

  return {
    generatedDocumentId: doc.id,
    studentProfileId: doc.studentProfileId,
    calendarMonth: doc.periodLabel,
    referenceCode,
    generatedAt: new Date(),
    student: {
      name: profile.fullName?.trim() || displayNameFromEmail(profile.user.email),
      office: profile.office,
    },
    narrative: journal?.narrative ?? "",
  };
}
