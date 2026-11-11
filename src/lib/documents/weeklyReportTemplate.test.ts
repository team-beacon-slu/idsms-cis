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
    companyHoliday: false,
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
    totals: {
      totalHours: 8,
      runningTotal: 48,
      conductDeductions: 0,
      remainingHours: 552,
      beginning: 40,
      ending: 48,
    },
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
    // SLU policy: a weekly report covers Monday to Friday.
    expect(html).toContain("Week No. 3 (Oct 5 – Oct 9, 2026)");
    expect(html).toContain("Name: <strong>Dela Cruz, Juan P.</strong>");
    expect(html).toContain("<strong>Company</strong>: Acme Corp");
  });

  it("lists Monday to Friday, a weekday off as a day off, and a weekend only when worked", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("Oct 9 (Friday)");
    expect(html).toMatch(/Oct 9 \(Friday\)<\/td>\s*<td><strong>Day off<\/strong>/);
    expect(html).not.toContain("Saturday");
    const worked = renderWeeklyReportHtml(
      sample({
        entries: [entry(), entry({ reportDate: new Date("2026-10-10T00:00:00Z") })],
      })
    );
    expect(worked).toContain("Oct 10 (Saturday)");
    expect(worked).toContain("Week No. 3 (Oct 5 – Oct 10, 2026)");
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

  it("labels a host company's own day off as a company holiday", () => {
    const html = renderWeeklyReportHtml(
      sample({
        entries: [
          entry({
            attendanceStatus: "HOLIDAY",
            actualHours: 0,
            creditedHours: 0,
            holidayName: "Chinese New Year",
            companyHoliday: true,
          }),
        ],
      })
    );
    expect(html).toContain("Holiday (Company)");
    expect(html).not.toContain("PH Calendar");
    expect(html).toContain("Chinese New Year");
  });

  it("prints the three totals, where beginning + this week = ending", () => {
    const data = sample();
    expect(data.totals.beginning + data.totals.totalHours).toBe(data.totals.ending);
    const html = renderWeeklyReportHtml(data);
    expect(html).toContain("Total work-hours rendered");
    expect(html).toContain("TOTAL work-hours (<u>beginning</u>)");
    expect(html).toContain("TOTAL rendered so far (<u>ending</u>)");
    expect(html).toContain("40 hrs");
    expect(html).toContain("48 hrs");
  });

  it("prints conduct deductions as their own line only when there are any", () => {
    expect(renderWeeklyReportHtml(sample())).not.toContain("conduct deductions");
    const data = sample();
    data.totals.conductDeductions = 4;
    expect(renderWeeklyReportHtml(data)).toContain("Less conduct deductions (to date)");
  });

  it("is the main report alone when the week has no overtime, under time or absence", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).not.toContain("Report on Overtime Hours");
    expect(html).not.toContain("Report on UNDER TIME Hours");
    expect(html).not.toContain("Report on Absences");
    expect(html).toContain("at least 30 minutes of off-duty time");
    expect(html).toContain("Extending the hours to compensate for tardiness is impermissible.");
  });

  it("prints the week's under time and absence sections on the next page of the same PDF", () => {
    const section = {
      student: { name: "Dela Cruz, Juan P." },
      company: { name: "Acme", supervisorName: "Maria Santos" },
      week: "IN_WEEKLY_REPORT" as const,
      generatedAt: new Date("2026-10-12T02:00:00Z"),
    };
    const html = renderWeeklyReportHtml(
      sample({
        timeReports: [
          {
            ...section,
            kind: "UT",
            rows: [
              {
                date: new Date("2026-10-06T00:00:00Z"),
                startTime: "08:00",
                endTime: "08:30",
                minutes: 30,
                reason: "Woke up late.",
              },
            ],
            absences: [],
          },
          {
            ...section,
            kind: "ABSENCE",
            rows: [],
            absences: [
              {
                date: new Date("2026-10-07T00:00:00Z"),
                endDate: null,
                startTime: null,
                endTime: null,
                kind: "EMERGENCY",
                reason: "Fever, saw a doctor",
                proof: "MEDICAL_CERTIFICATE",
              },
            ],
          },
        ],
      })
    );
    expect(html).toContain('<div class="page">');
    expect(html).toContain("Report on UNDER TIME Hours");
    expect(html).toContain("this section is only included if the student incurred an under time");
    expect(html).toContain("Woke up late.");
    expect(html).toContain("Report on Absences");
    expect(html).toContain("Fever, saw a doctor");
    expect(html).not.toContain("Report on Overtime Hours");
    // The main report still comes first.
    expect(html.indexOf("Detailed Time Record")).toBeLessThan(html.indexOf('<div class="page">'));
  });

  it("prints the days before the intern's first day of OJT as not yet started, not a day off", () => {
    const html = renderWeeklyReportHtml(
      sample({
        firstDay: new Date("2026-10-07T00:00:00Z"), // started on Wednesday
        entries: [entry({ reportDate: new Date("2026-10-07T00:00:00Z") })],
      })
    );
    expect(html.match(/OJT not yet started/g)).toHaveLength(2); // Monday and Tuesday
    expect(html.match(/Day off/g)).toHaveLength(2); // Thursday and Friday
    expect(html).not.toContain("Absent");
  });

  it("prints on SLU long bond in Calibri, with the totals inside the time record", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("size: 8.5in 13in");
    expect(html).toContain('font-family: "Calibri"');
    expect(html).toContain("IT-MMA/CS-CAD Department");
    expect(html).toMatch(/TOTAL work-hours \(<u>beginning<\/u>\)/);
    expect(html).toMatch(/TOTAL rendered so far \(<u>ending<\/u>\)/);
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
