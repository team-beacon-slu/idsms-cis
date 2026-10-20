import { escapeHtml } from "@/lib/documents/html";
import {
  renderWeeklyReportHtml,
  type WeeklyReportDocumentData,
} from "@/lib/documents/weeklyReportTemplate";

type Entry = WeeklyReportDocumentData["entries"][number];

function entry(over: Partial<Entry> = {}): Entry {
  return {
    reportDate: new Date("2026-10-05T00:00:00Z"),
    actualHours: 8,
    creditedHours: 8,
    accomplishments: "Built the login page",
    toolsUsed: "VS Code",
    attendanceStatus: "PRESENT",
    timeIn: "08:00",
    timeOut: "12:00",
    timeIn2: "13:00",
    timeOut2: "17:00",
    holidayName: null,
    ...over,
  };
}

function sample(overrides: Partial<WeeklyReportDocumentData> = {}): WeeklyReportDocumentData {
  return {
    weeklyReportId: "wr-1",
    studentProfileId: "p-1",
    referenceCode: "WR-20261005-ABCD1234",
    submittedAt: new Date("2026-10-12T02:00:00Z"),
    reasonForDelay: null,
    weekStart: new Date("2026-10-05T00:00:00Z"),
    weekEnd: new Date("2026-10-11T00:00:00Z"),
    weekNumber: 3,
    dueDate: new Date("2026-10-13T00:00:00Z"),
    student: {
      name: "Dela Cruz, Juan P.",
      email: "student.test@idsms.local",
      studentNumber: "2026-00123-MN-0",
      program: "BSIT",
      positionTitle: "Web Developer Intern",
      requiredHours: 600,
    },
    company: { name: "Acme Corp", supervisorName: "Maria Santos" },
    entries: [entry()],
    overtime: [],
    undertime: [],
    totals: { totalHours: 8, runningTotal: 48, remainingHours: 552, beginning: 40, ending: 48 },
    ...overrides,
  };
}

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;"
    );
  });

  it("renders null/undefined as an em dash", () => {
    expect(escapeHtml(null)).toBe("—");
    expect(escapeHtml(undefined)).toBe("—");
  });
});

describe("renderWeeklyReportHtml (SLU Weekly Work Report)", () => {
  it("prints SLU's header, week number, name and company", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("School of Accountancy, Management, Computing and Information Studies");
    expect(html).toContain("IT-MMA/CS-CAD Department");
    expect(html).toContain("Saint Louis University, Baguio City");
    expect(html).toContain("Weekly Work Report");
    expect(html).toContain("Week No. 3 (Oct 5 – Oct 11, 2026)");
    expect(html).toContain("Name: Dela Cruz, Juan P.");
    expect(html).toContain("Company: Acme Corp");
  });

  it("prints the detailed time record with both ranges and N hrs M mins", () => {
    const html = renderWeeklyReportHtml(
      sample({ entries: [entry({ creditedHours: 7.5, timeIn: "08:30" })] })
    );
    expect(html).toContain("Detailed Time Record");
    expect(html).toContain("Oct 5 (Monday)");
    expect(html).toContain("8:30 am – 12:00 pm");
    expect(html).toContain("1:00 pm – 5:00 pm");
    expect(html).toContain("7 hrs 30 mins");
  });

  it("labels holiday rows from the PH calendar with 0 hours", () => {
    const html = renderWeeklyReportHtml(
      sample({
        entries: [
          entry({
            attendanceStatus: "HOLIDAY",
            creditedHours: 0,
            timeIn: null,
            timeOut: null,
            timeIn2: null,
            timeOut2: null,
            accomplishments: null,
            holidayName: "Bonifacio Day",
          }),
        ],
      })
    );
    expect(html).toContain("Holiday (PH Calendar)");
    expect(html).toContain("Bonifacio Day");
    expect(html).toContain("0 hrs");
  });

  it("prints the three totals, where beginning + this week = ending", () => {
    const data = sample();
    expect(data.totals.beginning + data.totals.totalHours).toBe(data.totals.ending);
    const html = renderWeeklyReportHtml(data);
    expect(html).toContain("Total work-hours rendered");
    expect(html).toContain("TOTAL work-hours (beginning)");
    expect(html).toContain("TOTAL rendered so far (ending)");
    expect(html).toContain("40 hrs");
    expect(html).toContain("48 hrs");
  });

  it("omits the OT and UT sections when empty", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).not.toContain("Report on Overtime Hours");
    expect(html).not.toContain("Report on UNDER TIME Hours");
  });

  it("prints the OT and UT sections with a TOTAL UT row when present", () => {
    const html = renderWeeklyReportHtml(
      sample({
        overtime: [
          {
            date: new Date("2026-10-10T00:00:00Z"),
            startTime: "08:00",
            endTime: "12:00",
            minutes: 240,
            reason: "In lieu of the holiday",
          },
        ],
        undertime: [
          {
            date: new Date("2026-10-06T00:00:00Z"),
            startTime: "13:00",
            endTime: "17:00",
            minutes: 240,
            reason: "Submit my waiver",
          },
          {
            date: new Date("2026-10-09T00:00:00Z"),
            startTime: "08:00",
            endTime: "08:30",
            minutes: 30,
            reason: "Woke up late",
          },
        ],
      })
    );
    expect(html).toContain("Report on Overtime Hours");
    expect(html).toContain("Oct 10 (Saturday)");
    expect(html).toContain("In lieu of the holiday");
    expect(html).toContain("Report on UNDER TIME Hours");
    expect(html).toContain("TOTAL UT Hours");
    expect(html).toContain("4 hrs 30 mins");
    expect(html).toContain("at least 30 minutes of off-duty time");
    expect(html).toContain("Extending the hours to compensate for tardiness is impermissible.");
  });

  it("labels an OT request still awaiting the adviser", () => {
    const html = renderWeeklyReportHtml(
      sample({
        overtime: [
          {
            date: new Date("2026-10-10T00:00:00Z"),
            startTime: "08:00",
            endTime: "12:00",
            minutes: 240,
            reason: "Release",
            pending: true,
          },
        ],
      })
    );
    expect(html).toContain("Release (pending adviser approval)");
  });

  it("keeps the reference code, Manila timestamp and supervisor signature line", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("WR-20261005-ABCD1234");
    expect(html).toContain("Oct 12, 2026");
    expect(html).toContain("Maria Santos");
    expect(html).toContain("Date signed");
  });

  it("escapes HTML in every interpolated field", () => {
    const html = renderWeeklyReportHtml(
      sample({
        entries: [entry({ accomplishments: "<script>alert(1)</script></td>" })],
        student: { ...sample().student, name: "<b>Name</b>" },
        company: { name: "A&B <Corp>", supervisorName: "O'Neil" },
        reasonForDelay: "<img src=x onerror=alert(1)>",
        undertime: [
          {
            date: new Date("2026-10-06T00:00:00Z"),
            startTime: "13:00",
            endTime: "17:00",
            minutes: 240,
            reason: "<script>x</script>",
          },
        ],
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Name");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&lt;/td&gt;");
    expect(html).toContain("A&amp;B &lt;Corp&gt;");
  });

  it("shows the delay reason only when present", () => {
    expect(renderWeeklyReportHtml(sample())).not.toContain("Reason for late submission");
    expect(renderWeeklyReportHtml(sample({ reasonForDelay: "Typhoon" }))).toContain(
      "Reason for late submission"
    );
  });

  it("labels an unsubmitted preview instead of printing an empty reference code", () => {
    const html = renderWeeklyReportHtml(sample({ referenceCode: null, submittedAt: null }));
    expect(html).toContain("Issued on submission");
    expect(html).toContain("PREVIEW");
  });
});
