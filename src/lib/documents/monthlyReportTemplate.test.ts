import { renderMonthlyReportHtml } from "@/lib/documents/monthlyReportTemplate";

const data = {
  generatedDocumentId: "doc-m",
  studentProfileId: "p-1",
  calendarMonth: "2026-09",
  referenceCode: "MR-202609-ABCD1234",
  generatedAt: new Date("2026-10-11T02:00:00Z"),
  student: { name: "Dela Cruz, Juan P.", office: "IT Department <HQ>" },
  narrative: "First week: onboarding.\nMet the team.\n\nSecond topic: I learned Git.",
};

it("prints SLU's Journal on Learning Experience: month, name, office, narrative", () => {
  const html = renderMonthlyReportHtml(data);
  expect(html).toContain("Journal on Learning Experience");
  expect(html).toContain("Month: September 2026");
  expect(html).toContain("Name: <strong>Dela Cruz, Juan P.</strong>");
  expect(html).toContain("IT Department &lt;HQ&gt;");
  expect(html).toContain("size: 8.5in 13in");
  expect(html).toContain("MR-202609-ABCD1234");
});

it("keeps the intern's paragraphs and has no supervisor signature", () => {
  const html = renderMonthlyReportHtml(data);
  expect(html.match(/<p class="para">/g)).toHaveLength(2);
  expect(html).toContain("First week: onboarding.\nMet the team.");
  expect(html).not.toContain('class="sign"');
});
