import { escapeHtml, formatCalendarDate, formatInstant, PRINT_CSS } from "@/lib/documents/html";
import type { WeeklyReportDocumentData } from "@/lib/documents/weeklyReportTemplate";

export interface MonthlyReportDocumentData {
  generatedDocumentId: string;
  studentProfileId: string;
  calendarMonth: string; // "YYYY-MM"
  referenceCode: string;
  generatedAt: Date;
  student: WeeklyReportDocumentData["student"];
  company: WeeklyReportDocumentData["company"];
  weeks: { weekStart: Date; weekEnd: Date; status: string; totalHours: number }[];
  approvedHours: number;
}

function monthTitle(calendarMonth: string): string {
  const [year, month] = calendarMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// FR-WR-08 / FR-DG-03 monthly rollup of the month's weekly reports.
export function renderMonthlyReportHtml(data: MonthlyReportDocumentData): string {
  const rows = data.weeks
    .map(
      (w) => `
      <tr>
        <td>${escapeHtml(formatCalendarDate(w.weekStart))} – ${escapeHtml(formatCalendarDate(w.weekEnd))}</td>
        <td>${escapeHtml(w.status)}</td>
        <td>${escapeHtml(w.totalHours)} hrs</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Monthly Internship Report ${escapeHtml(data.referenceCode)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <header>
    <p class="eyebrow">Saint Louis University · SAMCIS</p>
    <h1>Monthly Internship Report</h1>
    <p class="period">${escapeHtml(monthTitle(data.calendarMonth))}</p>
  </header>

  <dl class="meta">
    <dt>Student</dt><dd>${escapeHtml(data.student.email)}</dd>
    <dt>Student number</dt><dd>${escapeHtml(data.student.studentNumber)}</dd>
    <dt>Program</dt><dd>${escapeHtml(data.student.program)}</dd>
    <dt>Position</dt><dd>${escapeHtml(data.student.positionTitle)}</dd>
    <dt>Host company</dt><dd>${escapeHtml(data.company?.name)}</dd>
    <dt>Supervisor</dt><dd>${escapeHtml(data.company?.supervisorName)}</dd>
    <dt>Reference code</dt><dd>${escapeHtml(data.referenceCode)}</dd>
    <dt>Required hours</dt><dd>${escapeHtml(data.student.requiredHours)}</dd>
  </dl>

  <table>
    <thead><tr><th>Week</th><th>Status</th><th>Hours</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <dl class="totals">
    <div><dt>Approved hours this month</dt><dd>${escapeHtml(data.approvedHours)} hrs</dd></div>
  </dl>

  <section class="signatures">
    <div>Student signature</div>
    <div>Company supervisor signature</div>
  </section>

  <footer>${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</footer>
</body>
</html>`;
}
