import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { loadMonthlyReportDocumentData } from "@/lib/documents/monthlyReportData";

beforeEach(() => resetPrismaMock());

const doc = (fullName: string | null) => ({
  id: "doc-1",
  periodLabel: "2026-07",
  studentProfileId: "p-1",
  studentProfile: { fullName, office: "IT Office", user: { email: "juan.delacruz@slu.edu.ph" } },
});

it("loads the month's journal, name and office", async () => {
  prismaMock.generatedDocument.findUnique.mockResolvedValue(doc("Dela Cruz, Juan P.") as never);
  prismaMock.learningJournal.findUnique.mockResolvedValue({ narrative: "I learned." } as never);

  const data = (await loadMonthlyReportDocumentData("doc-1", "MR-1"))!;

  expect(data.narrative).toBe("I learned.");
  expect(data.student).toEqual({ name: "Dela Cruz, Juan P.", office: "IT Office" });
  expect(prismaMock.learningJournal.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { studentProfileId_month: { studentProfileId: "p-1", month: "2026-07" } },
    })
  );
});

it("names the intern from the school email when no full name is set", async () => {
  prismaMock.generatedDocument.findUnique.mockResolvedValue(doc(null) as never);
  prismaMock.learningJournal.findUnique.mockResolvedValue(null);
  const data = (await loadMonthlyReportDocumentData("doc-1", "MR-1"))!;
  expect(data.student.name).toBe("Delacruz, Juan");
  expect(data.narrative).toBe("");
});
