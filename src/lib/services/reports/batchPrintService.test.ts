const assertCanAccessStudent = jest.fn(async () => undefined);
jest.mock("@/lib/services/accounts/userService", () => ({
  assertCanAccessStudent: (...args: unknown[]) => assertCanAccessStudent(...(args as [])),
}));
const loadData = jest.fn();
jest.mock("@/lib/documents/weeklyReportData", () => ({
  loadWeeklyReportDocumentData: (id: string) => loadData(id),
}));
jest.mock("@/lib/documents/weeklyReportTemplate", () => ({
  renderWeeklyReportHtml: (d: { id: string }) =>
    `<!doctype html><html><head><title>x</title></head><body><p>${d.id}</p></body></html>`,
}));
const renderHtmlToPdf = jest.fn(async (html: string) => Buffer.from(html));
jest.mock("@/lib/pdf/renderHtmlToPdf", () => ({
  renderHtmlToPdf: (html: string) => renderHtmlToPdf(html),
}));

import { Role, WeeklyReportStatus } from "@prisma/client";
import { prismaMock, resetPrismaMock } from "@/testUtils/prismaMock";
import { DocumentNotReadyError } from "@/lib/documents/errors";
import {
  BATCH_PRINT_MAX_REPORTS,
  renderWeeklyReportsBatch,
} from "@/lib/services/reports/batchPrintService";

const adviser = { id: "fac-1", role: Role.FACULTY_ADVISER };
const week = (id: string, name: string, start: string) => ({
  id,
  weekStart: new Date(`${start}T00:00:00Z`),
  studentProfile: { fullName: name },
});

beforeEach(() => {
  resetPrismaMock();
  assertCanAccessStudent.mockClear();
  renderHtmlToPdf.mockClear();
  loadData.mockImplementation(async (id: string) => ({ id, referenceCode: `WR-${id}` }));
});

describe("renderWeeklyReportsBatch", () => {
  it("checks access to every intern and prints only approved or regarded weeks", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([] as never);
    await expect(renderWeeklyReportsBatch(["p-1", "p-2"], adviser)).rejects.toThrow(
      DocumentNotReadyError
    );
    expect(assertCanAccessStudent).toHaveBeenCalledTimes(2);
    expect(prismaMock.weeklyReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentProfileId: { in: ["p-1", "p-2"] },
          status: { in: [WeeklyReportStatus.APPROVED, WeeklyReportStatus.REGARDED] },
        },
      })
    );
  });

  it("orders the PDF intern by intern, then week by week", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue([
      week("w-b1", "Santos, Ana", "2026-09-07"),
      week("w-a1", "Abad, Ben", "2026-09-07"),
      week("w-b2", "Santos, Ana", "2026-09-14"),
    ] as never);
    const pdf = (await renderWeeklyReportsBatch(["p-1", "p-2"], adviser)).toString();
    expect(pdf.indexOf("w-a1")).toBeLessThan(pdf.indexOf("w-b1"));
    expect(pdf.indexOf("w-b1")).toBeLessThan(pdf.indexOf("w-b2"));
    expect(pdf.match(/batch-doc page/g)).toHaveLength(2);
  });

  it("refuses a batch larger than the limit", async () => {
    prismaMock.weeklyReport.findMany.mockResolvedValue(
      Array.from({ length: BATCH_PRINT_MAX_REPORTS + 1 }, (_, i) =>
        week(`w-${i}`, "Santos, Ana", "2026-09-07")
      ) as never
    );
    await expect(renderWeeklyReportsBatch(["p-1"], adviser)).rejects.toThrow(/at most/);
    expect(renderHtmlToPdf).not.toHaveBeenCalled();
  });
});
