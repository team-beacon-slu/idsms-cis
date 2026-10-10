import { renderMonthlyReportHtml } from "@/lib/documents/monthlyReportTemplate";

const data = {
  generatedDocumentId: "doc-m",
  studentProfileId: "p-1",
  calendarMonth: "2026-09",
  referenceCode: "MR-202609-ABCD1234",
  generatedAt: new Date("2026-10-11T02:00:00Z"),
  student: {
    email: "s@x",
    studentNumber: "1",
    program: "BSIT",
    positionTitle: null,
    requiredHours: 600,
  },
  company: { name: "Acme <Corp>", supervisorName: "J" },
  weeks: [
    {
      weekStart: new Date("2026-09-28T00:00:00Z"),
      weekEnd: new Date("2026-10-04T00:00:00Z"),
      status: "APPROVED",
      totalHours: 40,
    },
  ],
  approvedHours: 40,
};

it("renders the month, reference code, weeks, approved hours, and signatures", () => {
  const html = renderMonthlyReportHtml(data);
  expect(html).toContain("September 2026");
  expect(html).toContain("MR-202609-ABCD1234");
  expect(html).toContain("40 hrs");
  expect(html).toContain("Company supervisor signature");
});

it("escapes interpolated text", () => {
  expect(renderMonthlyReportHtml(data)).toContain("Acme &lt;Corp&gt;");
});
