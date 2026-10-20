import { renderFinalReportHtml, type FinalReportDocumentData } from "./finalReportTemplate";

function sample(over: Partial<FinalReportDocumentData> = {}): FinalReportDocumentData {
  return {
    cover: {
      referenceCode: "FTR-20261021-ABCD1234",
      generatedAt: new Date("2026-10-21T02:00:00Z"),
      student: { fullName: "Dela Cruz, Juan P.", studentNumber: "2026-001", program: "BSIT" },
      company: { name: "Acme Corp" },
      renderedHours: 600,
      requiredHours: 600,
      academicYear: "2026-2027",
      semesterName: "1st Semester",
    },
    sections: {
      companyOverview: "Acme builds tools.",
      introduction: "My internship.",
      workAccomplished: "Built the login page.",
      learnings: "Testing matters.",
      recommendations: "More mentoring.",
    },
    supervisorScore: 4.5,
    supervisorScale: 5,
    peerScore: 90,
    peerScale: 100,
    attachments: {
      attendanceProof: true,
      certificateOfCompletion: true,
      certificateOfAttendance: true,
      certificatesOfParticipation: true,
    },
    ...over,
  };
}

describe("renderFinalReportHtml", () => {
  it("puts the WS-E cover first, then every section with its heading", () => {
    const html = renderFinalReportHtml(sample());
    expect(html.indexOf("Final Internship Report")).toBeLessThan(html.indexOf("Company Overview"));
    for (const text of [
      "Company Overview",
      "Introduction",
      "Work Accomplished",
      "Learnings",
      "Recommendations",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Built the login page.");
    expect(html).toContain("FTR-20261021-ABCD1234");
  });

  it("prints the evaluation scores with their scales and the attachment list", () => {
    const html = renderFinalReportHtml(sample());
    expect(html).toContain("4.5 / 5");
    expect(html).toContain("90 / 100");
    expect(html).toContain("Certificate of completion");
    expect(html).toContain("Google Classroom");
  });

  it("escapes user text", () => {
    const html = renderFinalReportHtml(
      sample({ sections: { ...sample().sections, learnings: "<script>x</script>" } })
    );
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});
