import { escapeHtml, formatInstant, PRINT_CSS } from "@/lib/documents/html";
import { clock } from "@/lib/utils/schedule";
import { formatHrsMins } from "@/lib/utils/timeMath";

// An OT or UT request printed in the report's optional sections.
export interface TimeRow {
  date: Date;
  startTime: string | null;
  endTime: string | null;
  minutes: number;
  reason: string;
}

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
  }[];
  overtime: TimeRow[];
  undertime: TimeRow[];
  totals: {
    totalHours: number;
    runningTotal: number;
    remainingHours: number;
    beginning: number; // before this week
    ending: number; // rendered so far, including this week
  };
}

const HEADER = [
  "School of Accountancy, Management, Computing and Information Studies",
  "IT-MMA/CS-CAD Department",
  "Saint Louis University, Baguio City",
];

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (d: Date) =>
  `${shortDate(d)} (${d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`;
const range = (a: string | null, b: string | null) =>
  a && b ? `${escapeHtml(clock(a))} – ${escapeHtml(clock(b))}` : "—";

function signatureLine(supervisor: string | undefined) {
  return `
  <section class="signatures">
    <div>${escapeHtml(supervisor)}<br />Supervisor (name and signature)</div>
    <div>&nbsp;<br />Date signed</div>
  </section>`;
}

// SLU Weekly Work Report layout (Workstream L1). Pure: same input → same HTML.
export function renderWeeklyReportHtml(data: WeeklyReportDocumentData): string {
  const isPreview = data.referenceCode === null;
  const supervisor = data.company?.supervisorName;

  const rows = data.entries
    .map((e) => {
      let times: string;
      let hours: string;
      if (e.attendanceStatus === "HOLIDAY") {
        times = `Holiday (PH Calendar)${e.holidayName ? `<br />${escapeHtml(e.holidayName)}` : ""}`;
        hours = formatHrsMins(0);
      } else if (e.attendanceStatus === "ABSENT") {
        times = "Absent";
        hours = formatHrsMins(0);
      } else {
        const second = e.timeIn2 && e.timeOut2 ? `<br />${range(e.timeIn2, e.timeOut2)}` : "";
        times = `${range(e.timeIn, e.timeOut)}${second}`;
        hours = e.creditedHours == null ? "—" : formatHrsMins(e.creditedHours);
      }
      return `
      <tr>
        <td>${escapeHtml(dayLabel(e.reportDate))}</td>
        <td>${times}</td>
        <td>${escapeHtml(hours)}</td>
        <td class="text">${escapeHtml(e.accomplishments)}</td>
      </tr>`;
    })
    .join("");

  const timeRows = (list: TimeRow[]) =>
    list
      .map(
        (r) => `
      <tr>
        <td>${escapeHtml(dayLabel(r.date))}</td>
        <td>${range(r.startTime, r.endTime)}</td>
        <td>${escapeHtml(formatHrsMins(r.minutes / 60))}</td>
        <td class="text">${escapeHtml(r.reason)}</td>
      </tr>`
      )
      .join("");

  const overtime = data.overtime.length
    ? `
  <h2>Report on Overtime Hours</h2>
  <table>
    <thead><tr><th>Date</th><th>Time in – Time out</th><th>Hours Rendered</th><th>Remarks</th></tr></thead>
    <tbody>${timeRows(data.overtime)}</tbody>
  </table>
  ${signatureLine(supervisor)}`
    : "";

  const utTotal = data.undertime.reduce((sum, r) => sum + r.minutes, 0);
  const undertime = data.undertime.length
    ? `
  <h2>Report on UNDER TIME Hours</h2>
  <table>
    <thead><tr><th>Date</th><th>UNDERTIME HOURS</th><th>Total UT Hours</th><th>Remarks</th></tr></thead>
    <tbody>${timeRows(data.undertime)}
      <tr><td colspan="2"><strong>TOTAL UT Hours</strong></td><td><strong>${escapeHtml(formatHrsMins(utTotal / 60))}</strong></td><td></td></tr>
    </tbody>
  </table>
  ${signatureLine(supervisor)}`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Weekly Work Report ${escapeHtml(data.referenceCode ?? "Preview")}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <header>
    ${HEADER.map((line) => `<p class="eyebrow">${line}</p>`).join("")}
    <h1>Weekly Work Report</h1>
    <p class="period">Week No. ${escapeHtml(data.weekNumber)} (${escapeHtml(shortDate(data.weekStart))} – ${escapeHtml(shortDate(data.weekEnd))}, ${data.weekEnd.getUTCFullYear()})</p>
    ${isPreview ? '<p class="watermark">PREVIEW — NOT YET SUBMITTED</p>' : ""}
  </header>

  <p>Name: ${escapeHtml(data.student.name)}</p>
  <p>Company: ${escapeHtml(data.company?.name)}</p>
  <p>Reference code: ${isPreview ? "Issued on submission" : escapeHtml(data.referenceCode)}</p>

  <h2>Detailed Time Record</h2>
  <table>
    <thead><tr><th>Date (Day)</th><th>Actual Work Times</th><th>Hours Rendered</th><th>Work Accomplishment</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <dl class="totals">
    <div><dt>Total work-hours rendered</dt><dd>${escapeHtml(formatHrsMins(data.totals.totalHours))}</dd></div>
    <div><dt>TOTAL work-hours (beginning)</dt><dd>${escapeHtml(formatHrsMins(data.totals.beginning))}</dd></div>
    <div><dt>TOTAL rendered so far (ending)</dt><dd>${escapeHtml(formatHrsMins(data.totals.ending))}</dd></div>
  </dl>

  ${
    data.reasonForDelay
      ? `<p><strong>Reason for late submission:</strong> ${escapeHtml(data.reasonForDelay)}</p>`
      : ""
  }

  ${signatureLine(supervisor)}
  ${overtime}
  ${undertime}

  <p class="note">An overtime is credited when the Intern has incurred at least 30 minutes of off-duty time. Less than the minimum time will not be credited.</p>
  <p class="note">Extending the hours to compensate for tardiness is impermissible.</p>

  <footer>
    ${
      isPreview
        ? "Preview generated by IDSMS-CIS"
        : `${escapeHtml(data.referenceCode)} · submitted ${escapeHtml(formatInstant(data.submittedAt!))} · IDSMS-CIS`
    }
  </footer>
</body>
</html>`;
}
