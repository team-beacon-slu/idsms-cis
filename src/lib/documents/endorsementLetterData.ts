import { prisma } from "@/lib/prisma";
import type { EndorsementLetterData } from "@/lib/documents/endorsementLetterTemplate";

export class EndorsementDataIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EndorsementDataIncompleteError";
  }
}

export async function loadEndorsementLetterData(
  studentProfileId: string,
  referenceCode: string,
  endorsementDate: Date
): Promise<EndorsementLetterData> {
  const profile = await prisma.studentProfile.findUniqueOrThrow({
    where: { id: studentProfileId },
    select: {
      id: true,
      fullName: true,
      studentNumber: true,
      program: true,
      positionTitle: true,
      requiredHours: true,
      company: {
        select: { name: true, address: true, supervisorName: true, supervisorPosition: true },
      },
    },
  });

  if (!profile.fullName?.trim()) {
    throw new EndorsementDataIncompleteError(
      "The student's full name is missing — set it on the student's profile first"
    );
  }
  if (!profile.company) {
    throw new EndorsementDataIncompleteError("The student has no host company assigned yet");
  }

  return {
    studentProfileId: profile.id,
    referenceCode,
    endorsementDate,
    student: {
      fullName: profile.fullName.trim(),
      studentNumber: profile.studentNumber,
      program: profile.program,
      positionTitle: profile.positionTitle,
      requiredHours: profile.requiredHours,
    },
    company: profile.company,
  };
}
