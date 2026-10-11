import { renderFinalCoverHtml } from "@/lib/documents/finalCoverTemplate";

it("renders title, student, hours, reference code; escapes text", () => {
  const html = renderFinalCoverHtml({
    referenceCode: "FC-20270115-ABCD1234",
    generatedAt: new Date("2027-01-15T02:00:00Z"),
    student: { fullName: "Juan <b>", studentNumber: "1", program: "BSIT" },
    company: { name: "Acme" },
    renderedHours: 600,
    requiredHours: 600,
    academicYear: "2026-2027",
    semesterName: "1st Semester",
  });
  expect(html).toContain("Final Internship Report");
  expect(html).toContain("FC-20270115-ABCD1234");
  expect(html).toContain("600 / 600 hours");
  expect(html).toContain("Juan &lt;b&gt;");
});
