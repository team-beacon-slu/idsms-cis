import { renderFinalReportHtml, type FinalReportDocumentData } from "./finalReportTemplate";
import { ATTACHMENT_KEYS, SECTION_KEYS } from "@/lib/validators/finalReport";

function sample(over: Partial<FinalReportDocumentData> = {}): FinalReportDocumentData {
  return {
    cover: {
      referenceCode: "FTR-20261021-ABCD1234",
      generatedAt: new Date("2026-10-21T02:00:00Z"),
      student: { fullName: "Dela Cruz, Juan P.", studentNumber: "2026-001", program: "BSIT" },
      company: { name: "Acme Corp" },
      adviserName: "Maria Reyes",
    },
    basics: {
      office: "Systems Unit",
      start: new Date("2026-06-01T00:00:00Z"),
      end: new Date("2026-08-28T00:00:00Z"),
    },
    sections: {
      ...Object.fromEntries(SECTION_KEYS.map((k) => [k, `Text for ${k}`])),
      tasks: "Built the login page.\n\nWrote the API tests.",
      workRemarks: "",
      selfRemarks: "",
    },
    assessment: {
      work: [4, 3, 2, 1, 4, 3, 2, 1, 4, 3],
      others: [{ label: "Figma", rating: 2 }],
      supervisorGuidance: 4,
      coworkers: 3,
      self: Array(10).fill(3),
    },
    attachments: Object.fromEntries(ATTACHMENT_KEYS.map((k) => [k, true])),
    ...over,
  };
}

describe("renderFinalReportHtml (SLU Technical Report)", () => {
  it("prints SLU's parts in order, each on a new page, on long bond in Cambria 12", () => {
    const html = renderFinalReportHtml(sample());
    const order = [
      "A Technical Report",
      "Table of Contents",
      "Company Profile",
      "Company Resources",
      "Internship Program",
      "Assessment",
      "Appendix",
    ].map((h) => html.indexOf(`>${h}<`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/<section class="sheet"/g)).toHaveLength(6); // TOC + 5 parts
    expect(html).toContain("size: 8.5in 13in");
    expect(html).toContain("line-height: 1.5");
    expect(html).toContain("font-size: 12pt");
  });

  it("fills the basic information table and the lettered task rows", () => {
    const html = renderFinalReportHtml(sample());
    expect(html).toContain("<td>Systems Unit</td>");
    expect(html).toContain("June 1, 2026");
    expect(html).toContain("August 28, 2026");
    expect(html).toContain('<td class="letter">A</td><td class="text">Built the login page.</td>');
    expect(html).toContain('<td class="letter">B</td><td class="text">Wrote the API tests.</td>');
  });

  it("prints both assessments with their scales, other skills, and leaves out empty remarks", () => {
    const html = renderFinalReportHtml(sample());
    expect(html).toContain(
      "Extensive = 4, Adequate/Sufficient = 3, Occasional = 2, Rare to None = 1"
    );
    expect(html).toContain("Very Good = 4, Good = 3, Acceptable = 2, Poor = 1");
    expect(html).toContain("a) Analytical skills");
    expect(html).toContain("k) Others: Figma");
    expect(html).toContain("j) Critical thinking");
    expect(html).not.toContain("<strong>Remarks:</strong>");
    const withRemarks = renderFinalReportHtml(
      sample({ sections: { ...sample().sections, workRemarks: "Great mentors." } })
    );
    expect(withRemarks).toContain("<strong>Remarks:</strong>");
    expect(withRemarks).toContain("Great mentors.");
  });

  it("numbers the table of contents once laid out, and leaves the title page unnumbered", () => {
    const html = renderFinalReportHtml(sample());
    expect(html).toContain('data-toc="appendix"');
    expect(html).toContain("@page :first { @bottom-center { content: none; } }");
  });

  it("escapes user text", () => {
    const html = renderFinalReportHtml(
      sample({ sections: { ...sample().sections, officeCulture: "<script>x</script>" } })
    );
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});
