import { escapeHtml, formatInstant } from "@/lib/documents/html";
import { samcisDocument, supervisorSignature } from "@/lib/documents/slu";
import { clock } from "@/lib/utils/schedule";
import { formatHrsMins } from "@/lib/utils/timeMath";

export interface WeeklyReportDocumentData {
  weeklyReportId: string;
  studentProfileId: string;
  referenceCode: string | null; // null until submitted (preview only)
  submittedAt: Date | null;
  reasonForDelay: string | null;
  weekStart: Date;
  weekEnd: Date;
  weekNumber: number;
  dueDate: Date;
  student: {
    name: string; // "Last, First M." as entered, or derived from the school email
    email: string;
    studentNumber: string;
    program: string;
    positionTitle: string | null;
    requiredHours: number;
  };
  company: { name: string; supervisorName: string } | null;
  entries: {
    reportDate: Date;
    actualHours: number | null;
    creditedHours: number | null; // SLU-credited (entryCreditedHours)
    accomplishments: string | null;
    toolsUsed: string | null;
    attendanceStatus: string; // PRESENT | ABSENT | HOLIDAY | SCHEDULED
    timeIn: string | null; // "HH:MM"
    timeOut: string | null;
    timeIn2: string | null;
    timeOut2: string | null;
    holidayName: string | null;
    companyHoliday: boolean; // the host company's own day off, not a PH holiday
  }[];
  totals: {
    totalHours: number;
    runningTotal: number;
    conductDeductions: number; // active, dated on or before the week end
    remainingHours: number;
    beginning: number; // before this week
    ending: number; // rendered so far, including this week
  };
}

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const dayLabel = (d: Date) =>
  `${shortDate(d)} (${d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`;
export const timeRange = (a: string | null, b: string | null) =>
  a && b ? `${escapeHtml(clock(a))} – ${escapeHtml(clock(b))}` : "—";

// SLU Weekly Work Report (SAMCIS template, long bond). Pure: same input → same HTML.
// Overtime, under time and absences print as their own reports (timeReportTemplate.ts).
export function renderWeeklyReportHtml(data: WeeklyReportDocumentData): string {
  const isPreview = data.referenceCode === null;

  const rows = data.entries
    .map((e) => {
      let times: string;
      let hours: string;
      if (e.attendanceStatus === "HOLIDAY") {
        times = `<strong>Holiday (${e.companyHoliday ? "Company" : "PH Calendar"})</strong>${e.holidayName ? `<br />${escapeHtml(e.holidayName)}` : ""}`;
        hours = "0";
      } else if (e.attendanceStatus === "ABSENT") {
        times = "<strong>Absent</strong>";
        hours = "0";
      } else {
        const second = e.timeIn2 && e.timeOut2 ? `<br />${timeRange(e.timeIn2, e.timeOut2)}` : "";
        times = `${timeRange(e.timeIn, e.timeOut)}${second}`;
        hours = e.creditedHours == null ? "—" : formatHrsMins(e.creditedHours);
      }
      return `
      <tr>
        <td>${escapeHtml(dayLabel(e.reportDate))}</td>
        <td>${times}</td>
        <td class="num">${escapeHtml(hours)}</td>
        <td class="text">${escapeHtml(e.accomplishments)}</td>
      </tr>`;
    })
    .join("");

  const total = (label: string, value: number, minus = false) => `
      <tr class="total">
        <td colspan="2" class="label">${label}</td>
        <td class="num">${minus ? "−" : ""}${escapeHtml(formatHrsMins(value))}</td>
        <td class="blank"></td>
      </tr>`;

  return samcisDocument(
    `Weekly Work Report ${data.referenceCode ?? "Preview"}`,
    `
  <style>
    tr.total td.label { border: none; text-align: right; }
    tr.total td.blank { border: none; }
    col.date { width: 1.6in; } col.times { width: 2.1in; } col.hours { width: 1.25in; }
  </style>
  <div class="title">
    <h1>Weekly Work Report</h1>
    <p>Week No. ${escapeHtml(data.weekNumber)} (${escapeHtml(shortDate(data.weekStart))} – ${escapeHtml(shortDate(data.weekEnd))}, ${data.weekEnd.getUTCFullYear()})</p>
    ${isPreview ? '<p class="watermark">PREVIEW — NOT YET SUBMITTED</p>' : ""}
  </div>

  <div class="who">
    <p>Name: <strong>${escapeHtml(data.student.name)}</strong></p>
    <p><strong>Company</strong>: ${escapeHtml(data.company?.name)}</p>
  </div>

  <p style="margin-bottom: 0.25in">Detailed Time Record:</p>
  <table class="grid">
    <colgroup><col class="date" /><col class="times" /><col class="hours" /><col /></colgroup>
    <thead><tr><th>Date (Day)</th><th>Actual Work Times</th><th>Hours Rendered</th><th>Work Accomplishment</th></tr></thead>
    <tbody>${rows}
      ${total("Total work-hours rendered", data.totals.totalHours)}
      ${total("TOTAL work-hours (<u>beginning</u>)", data.totals.beginning)}
      ${total("TOTAL rendered so far (<u>ending</u>)", data.totals.ending)}
      ${data.totals.conductDeductions > 0 ? total("Less conduct deductions (to date)", data.totals.conductDeductions, true) : ""}
    </tbody>
  </table>

  ${
    data.reasonForDelay
      ? `<p style="margin-top: 0.2in"><strong>Reason for late submission:</strong> ${escapeHtml(data.reasonForDelay)}</p>`
      : ""
  }

  <div class="note" style="margin-top: 0.3in">
    <p><strong><u>Note:</u></strong></p>
    <ul style="margin: 0">
      <li>An overtime is credited when the Intern has incurred at least 30 minutes of off-duty time. Less than the minimum time will not be credited.</li>
      <li>Extending the hours to compensate for tardiness is impermissible.</li>
    </ul>
  </div>

  ${supervisorSignature(data.company?.supervisorName)}

  <p class="ref">${
    isPreview
      ? "Reference code: Issued on submission · Preview generated by IDSMS-CIS"
      : `${escapeHtml(data.referenceCode)} · submitted ${escapeHtml(formatInstant(data.submittedAt!))} · IDSMS-CIS`
  }</p>`
  );
}
