import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import {
  EndorsementDataIncompleteError,
  loadEndorsementLetterData,
} from "@/lib/documents/endorsementLetterData";

beforeEach(() => resetPrismaMock());

const profile = {
  id: "p-1",
  fullName: "Juan Dela Cruz",
  studentNumber: "2026-00123-MN-0",
  program: "BSIT",
  positionTitle: null,
  requiredHours: 600,
  company: {
    name: "Acme",
    address: "Baguio",
    supervisorName: "Maria",
    supervisorPosition: "IT Manager",
  },
};

it("loads FR-DG-01 data", async () => {
  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue(profile as never);
  const data = await loadEndorsementLetterData("p-1", "EL-1", new Date("2026-10-11T00:00:00Z"));
  expect(data.student.fullName).toBe("Juan Dela Cruz");
  expect(data.company.supervisorPosition).toBe("IT Manager");
});

it("explains which FR-DG-01 field is missing", async () => {
  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
    ...profile,
    fullName: null,
  } as never);
  await expect(loadEndorsementLetterData("p-1", "EL-1", new Date())).rejects.toThrow(/full name/i);

  prismaMock.studentProfile.findUniqueOrThrow.mockResolvedValue({
    ...profile,
    company: null,
  } as never);
  await expect(loadEndorsementLetterData("p-1", "EL-1", new Date())).rejects.toThrow(
    EndorsementDataIncompleteError
  );
});
