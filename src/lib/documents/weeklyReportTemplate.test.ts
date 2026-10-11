import { escapeHtml } from "@/lib/documents/html";
import {
  renderWeeklyReportHtml,
  type WeeklyReportDocumentData,
} from "@/lib/documents/weeklyReportTemplate";

function sample(overrides: Partial<WeeklyReportDocumentData> = {}): WeeklyReportDocumentData {
  return {
    weeklyReportId: "wr-1",
    studentProfileId: "p-1",
    referenceCode: "WR-20261005-ABCD1234",
    submittedAt: new Date("2026-10-12T02:00:00Z"),
    reasonForDelay: null,
    weekStart: new Date("2026-10-05T00:00:00Z"),
    weekEnd: new Date("2026-10-11T00:00:00Z"),
    dueDate: new Date("2026-10-13T00:00:00Z"),
    student: {
      email: "student.test@idsms.local",
      studentNumber: "2026-00123-MN-0",
      program: "BSIT",
      positionTitle: "Web Developer Intern",
      requiredHours: 600,
    },
    company: { name: "Acme Corp", supervisorName: "Juan Dela Cruz" },
    entries: [
      {
        reportDate: new Date("2026-10-05T00:00:00Z"),
        actualHours: 8,
        accomplishments: "Built the login page",
        toolsUsed: "VS Code",
        attendanceStatus: "PRESENT",
        timeIn: "08:00",
        timeOut: "17:00",
      },
    ],
    totals: { totalHours: 8, runningTotal: 48, remainingHours: 552 },
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

describe("renderWeeklyReportHtml", () => {
  it("includes the reference code, submission timestamp, and signature lines (FR-DG-04)", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("WR-20261005-ABCD1234");
    expect(html).toContain("Oct 12, 2026");
    expect(html).toContain("Company supervisor signature");
    expect(html).toContain("Student signature");
  });

  it("renders the week, totals, and each daily entry", () => {
    const html = renderWeeklyReportHtml(sample());
    expect(html).toContain("October 5, 2026");
    expect(html).toContain("October 11, 2026");
    expect(html).toContain("Built the login page");
    expect(html).toContain("552 / 600 hrs");
  });

  it("escapes HTML in every interpolated field", () => {
    const html = renderWeeklyReportHtml(
      sample({
        entries: [
          {
            reportDate: new Date("2026-10-05T00:00:00Z"),
            actualHours: 8,
            accomplishments: "<script>alert(1)</script></td>",
            toolsUsed: `"quoted" & <b>`,
            attendanceStatus: "<u>PRESENT</u>",
            timeIn: "<i>08:00",
            timeOut: "17:00",
          },
        ],
        company: { name: "A&B <Corp>", supervisorName: "O'Neil" },
        reasonForDelay: "<img src=x onerror=alert(1)>",
      })
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<i>08:00");
    expect(html).not.toContain("<u>PRESENT");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&lt;/td&gt;");
    expect(html).toContain("A&amp;B &lt;Corp&gt;");
  });

  it("shows each day's attendance status and time in/out", () => {
    const html = renderWeeklyReportHtml(
      sample({
        entries: [
          {
            reportDate: new Date("2026-10-05T00:00:00Z"),
            actualHours: 8,
            accomplishments: "Built the login page",
            toolsUsed: null,
            attendanceStatus: "PRESENT",
            timeIn: "08:00",
            timeOut: "17:00",
          },
          {
            reportDate: new Date("2026-10-06T00:00:00Z"),
            actualHours: 0,
            accomplishments: null,
            toolsUsed: null,
            attendanceStatus: "HOLIDAY",
            timeIn: null,
            timeOut: null,
          },
        ],
      })
    );
    expect(html).toContain("<th>Status</th>");
    expect(html).toContain("08:00–17:00");
    expect(html).toContain("Holiday");
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
