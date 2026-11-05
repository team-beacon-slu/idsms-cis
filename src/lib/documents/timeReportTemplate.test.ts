import {
  renderTimeReportHtml,
  type TimeReportDocumentData,
} from "@/lib/documents/timeReportTemplate";

const base = (over: Partial<TimeReportDocumentData> = {}): TimeReportDocumentData => ({
  kind: "OT",
  student: { name: "Dela Cruz, Juan P." },
  company: { name: "Acme Corp", supervisorName: "Maria Santos" },
  week: {
    number: 1,
    start: new Date("2026-10-05T00:00:00Z"),
    end: new Date("2026-10-10T00:00:00Z"),
  },
  rows: [],
  absences: [],
  generatedAt: new Date("2026-10-12T02:00:00Z"),
  ...over,
});

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("renderTimeReportHtml (SLU OT / UT / absence reports)", () => {
  it("prints SLU's overtime table with a TOTAL OT row and the supervisor line", () => {
    const html = renderTimeReportHtml(
      base({
        rows: [
          {
            date: d("2026-10-10"),
            startTime: "08:00",
            endTime: "12:00",
            minutes: 240,
            reason: "In lieu of the holiday",
          },
        ],
      })
    );
    expect(html).toContain("Report on Overtime Hours");
    expect(html).toContain("Week No. 1");
    expect(html).toContain("Oct 10 (Saturday)");
    expect(html).toContain("TOTAL OT Hours");
    expect(html).toContain("4 hrs");
    expect(html).toContain("Maria Santos");
    expect(html).toContain("size: 8.5in 13in");
    expect(html).not.toContain("UNDER TIME");
  });

  it("totals under time across rows and marks a pending request", () => {
    const html = renderTimeReportHtml(
      base({
        kind: "UT",
        week: null,
        rows: [
          {
            date: d("2026-10-06"),
            startTime: "13:00",
            endTime: "17:00",
            minutes: 240,
            reason: "Waiver",
          },
          {
            date: d("2026-10-09"),
            startTime: "08:00",
            endTime: "08:30",
            minutes: 30,
            reason: "Woke up late",
            pending: true,
          },
        ],
      })
    );
    expect(html).toContain("Report on UNDER TIME Hours");
    expect(html).toContain("Whole internship");
    expect(html).toContain("TOTAL UT Hours");
    expect(html).toContain("4 hrs 30 mins");
    expect(html).toContain("Woke up late (pending adviser approval)");
  });

  it("lists leaves and unfiled absences, and escapes the reason", () => {
    const html = renderTimeReportHtml(
      base({
        kind: "ABSENCE",
        absences: [
          {
            date: d("2026-10-06"),
            endDate: d("2026-10-07"),
            startTime: null,
            endTime: null,
            kind: "EMERGENCY",
            reason: "<b>Fever</b>",
            proof: "MEDICAL_CERTIFICATE",
          },
          {
            date: d("2026-10-09"),
            endDate: null,
            startTime: null,
            endTime: null,
            kind: null,
            reason: null,
            proof: null,
          },
        ],
      })
    );
    expect(html).toContain("Report on Absences");
    expect(html).toContain("Oct 6 (Tuesday) to Oct 7 (Wednesday)");
    expect(html).toContain("Emergency leave");
    expect(html).toContain("Medical certificate");
    expect(html).toContain("Absent (no leave filed)");
    expect(html).toContain("&lt;b&gt;Fever");
    expect(html).not.toContain("<b>Fever");
  });

  it("says so when there is nothing to report", () => {
    expect(renderTimeReportHtml(base())).toContain("No overtime recorded.");
  });
});
