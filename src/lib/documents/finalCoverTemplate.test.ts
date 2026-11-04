import { renderFinalCoverHtml } from "@/lib/documents/finalCoverTemplate";

it("prints SLU's title page: company, department, course, adviser, intern, month", () => {
  const html = renderFinalCoverHtml({
    referenceCode: "FC-20270115-ABCD1234",
    generatedAt: new Date("2027-01-15T02:00:00Z"),
    student: { fullName: "Juan <b>", studentNumber: "1", program: "BSCS" },
    company: { name: "Acme" },
    adviserName: "Maria Reyes",
  });
  expect(html).toContain("Internship: <em>Acme</em>");
  expect(html).toContain("A Technical Report");
  expect(html).toContain("The Department of Computer Science");
  expect(html).toContain("CS 331 Practicum");
  expect(html).toContain("Maria Reyes");
  expect(html).toContain("Practicum Adviser");
  expect(html).toContain("January 2027");
  expect(html).toContain("size: 8.5in 13in");
  expect(html).toContain("Juan &lt;b&gt;");
});
