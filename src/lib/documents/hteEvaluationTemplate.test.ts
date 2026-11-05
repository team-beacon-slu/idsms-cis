import { renderHteEvaluationHtml } from "@/lib/documents/hteEvaluationTemplate";

const form = {
  name: "Dela Cruz, Juan P.",
  email: "juan@slu.edu.ph",
  company: { name: "Acme <Corp>", address: "Session Rd, Baguio", supervisorName: "Maria Santos" },
  from: new Date("2026-06-01T00:00:00Z"),
  to: new Date("2026-08-28T00:00:00Z"),
  obligations: [4, 3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1],
  quality: [4, 4, 3, 3, 2, 1],
  liked: "The mentoring.",
  improve: null,
  comment: "<b>More laptops</b>",
  submittedAt: new Date("2026-08-29T02:00:00Z"),
};

describe("renderHteEvaluationHtml (FM-VAA-052)", () => {
  it("prints VPAA's five A4 pages, each with the document-control box", () => {
    const html = renderHteEvaluationHtml(form);
    expect(html).toContain("size: A4");
    expect(html).toContain('font-family: "Century Gothic"');
    expect(html.match(/<table class="docbox">/g)).toHaveLength(5);
    expect(html).toContain("<strong>5</strong> of <strong>5</strong>");
    expect(html).toContain("FM-VAA-052");
    expect(html).toContain("7 Aug 2024");
    expect(html).toContain("Office of the Vice President for Academic Affairs (VPAA)");
  });

  it("fills the respondent fields and ticks one column per item", () => {
    const html = renderHteEvaluationHtml(form);
    expect(html).toContain("Dela Cruz, Juan P.");
    expect(html).toContain("juan@slu.edu.ph");
    expect(html).toContain("Acme &lt;Corp&gt;");
    expect(html).toContain("Session Rd, Baguio");
    expect(html).toContain("June 1, 2026 – August 28, 2026");
    expect(html.match(/aria-label="selected"/g)).toHaveLength(22);
    expect(html).toContain("16.</span> Issues certificates of completion");
    expect(html).toContain("22.</span> Provision of learning new and trend skills");
  });

  it("prints the comments, escaped", () => {
    const html = renderHteEvaluationHtml(form);
    expect(html).toContain("The mentoring.");
    expect(html).toContain("&lt;b&gt;More laptops");
    expect(html).not.toContain("<b>More laptops");
  });
});
