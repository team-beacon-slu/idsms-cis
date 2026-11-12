import { escapeHtml, formatInstant } from "@/lib/documents/html";
import { samcisDocument } from "@/lib/documents/slu";
import { dayLabel, timeRange } from "@/lib/documents/weeklyReportTemplate";
import { formatHrsMins } from "@/lib/utils/timeMath";

// An overtime or under time request, one table row.
export interface TimeRow {
  date: Date;
  startTime: string | null;
  endTime: string | null;
  minutes: number;
  reason: string;
  pending?: boolean; // filed but not yet approved by the adviser
}

// A day (or days) away: a leave request, or an ABSENT day with no request behind it.
export interface AbsenceRow {
  date: Date;
  endDate: Date | null;
  startTime: string | null; // partial-day leave
  endTime: string | null;
  kind: "ANTICIPATED" | "EMERGENCY" | null; // null: marked absent, no leave request filed
  reason: string | null;
  proof: string | null;
  pending?: boolean;
}

export type TimeReportKind = "OT" | "UT" | "ABSENCE";

export interface TimeReportDocumentData {
  kind: TimeReportKind;
  student: { name: string };
  company: { name: string; supervisorName: string } | null;
  // The week it covers, null for the whole internship (terminal requirement), or
  // "IN_WEEKLY_REPORT" when it prints as a section of that week's Weekly Work Report.
  week: { number: number; start: Date; end: Date } | "IN_WEEKLY_REPORT" | null;
  rows: TimeRow[];
  absences: AbsenceRow[];
  generatedAt: Date;
}

const PROOF: Record<string, string> = {
  MEDICAL_CERTIFICATE: "Medical certificate",
  PROOF_OF_LEAVE: "Proof of leave",
  WRITTEN_NOTICE: "Written notice",
};

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function remarks(r: { reason: string | null; pending?: boolean }) {
  return escapeHtml(r.pending ? `${r.reason ?? ""} (pending adviser approval)` : r.reason);
}

// One SLU section: "Report on Overtime Hours" / "Report on UNDER TIME Hours" (WWR & JLE
// templates, page 2), or an absence report in the same style (the guidelines make it optional,
// with no SLU template): heading, table and the supervisor's signature line. A week's sections
// print inside its Weekly Work Report; on their own they cover the whole internship.
export function renderTimeReportSection(data: TimeReportDocumentData): string {
  const total = data.rows.reduce((sum, r) => sum + r.minutes, 0);
  const totalRow = (label: string) => `
      <tr><td class="num"><strong>${label}</strong></td><td></td><td class="num">${escapeHtml(formatHrsMins(total / 60))}</td><td></td></tr>`;
  const timeRows = data.rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(dayLabel(r.date))}</td>
        <td class="num">${timeRange(r.startTime, r.endTime)}</td>
        <td class="num">${escapeHtml(formatHrsMins(r.minutes / 60))}</td>
        <td class="text">${remarks(r)}</td>
      </tr>`
    )
    .join("");
  const none = (what: string) => `<tr><td colspan="4" class="num">No ${what} recorded.</td></tr>`;

  const title = TITLE[data.kind];
  let hint: string; // SLU's own wording under each heading
  let table: string;
  if (data.kind === "OT") {
    hint = "this section is only included if the student rendered over time";
    table = `
    <thead><tr><th>Date</th><th>Time in – Time Out</th><th>Hours Rendered</th><th>Remarks<br /><em style="font-weight: normal">reasons for off-duty work, with proof</em></th></tr></thead>
    <tbody>${timeRows || none("overtime")}${totalRow("TOTAL OT Hours")}</tbody>`;
  } else if (data.kind === "UT") {
    hint = "this section is only included if the student incurred an under time";
    table = `
    <thead><tr><th>Date</th><th>UNDERTIME HOURS</th><th>Total UT Hours</th><th>Remarks<br /><em style="font-weight: normal">reasons for under time, with proof</em></th></tr></thead>
    <tbody>${timeRows || none("under time")}${totalRow("TOTAL UT Hours")}</tbody>`;
  } else {
    hint = "this section is only included if the student was absent";
    const days = (a: AbsenceRow) =>
      a.endDate && a.endDate > a.date
        ? `${escapeHtml(dayLabel(a.date))} to ${escapeHtml(dayLabel(a.endDate))}`
        : escapeHtml(dayLabel(a.date));
    const rows = data.absences
      .map(
        (a) => `
      <tr>
        <td>${days(a)}${a.startTime ? `<br />${timeRange(a.startTime, a.endTime)}` : ""}</td>
        <td>${a.reason?.startsWith("No duty: ") ? "No duty" : a.kind === "ANTICIPATED" ? "Leave (filed ahead)" : a.kind === "EMERGENCY" ? "Emergency leave" : "Absent (no leave filed)"}</td>
        <td class="text">${remarks(a)}</td>
        <td>${escapeHtml(a.proof ? (PROOF[a.proof] ?? a.proof) : null)}</td>
      </tr>`
      )
      .join("");
    table = `
    <colgroup><col style="width: 2.1in" /><col style="width: 1.5in" /><col /><col style="width: 1.3in" /></colgroup>
    <thead><tr><th>Date</th><th>Type</th><th>Reason</th><th>Proof attached</th></tr></thead>
    <tbody>${rows || none("absences")}</tbody>`;
  }

  const scope =
    data.week === "IN_WEEKLY_REPORT"
      ? hint
      : data.week
        ? `Week No. ${data.week.number} (${shortDate(data.week.start)} – ${shortDate(data.week.end)})`
        : "Whole internship";

  return `
  <section class="time-report">
    <h2 class="report">${title} <span class="hint">(${scope})</span></h2>
    <table class="grid">${table}
    </table>
    ${data.kind === "ABSENCE" ? '<p class="note" style="margin: 0.15in 0.3in 0">Inform your supervisor whenever you cannot go to work, and your faculty adviser through your supervisor.</p>' : ""}
    <p class="note" style="margin: 0.1in 0.3in 0"><em>Evidence (a screenshot or document) for each entry is submitted with this report in Google Classroom.</em></p>
    <div class="sign"><div class="line">${escapeHtml(data.company?.supervisorName)}, Date</div></div>
  </section>`;
}

const TITLE: Record<TimeReportKind, string> = {
  OT: "Report on Overtime Hours",
  UT: "Report on UNDER TIME Hours",
  ABSENCE: "Report on Absences",
};

export const TIME_REPORT_CSS = `
    section.time-report { break-inside: avoid; margin-bottom: 0.45in; }
    section.time-report table.grid { margin: 0 auto; width: 6.6in; }
    section.time-report h2.report { margin-left: 0.3in; }`;

// A section printed on its own (the whole internship, for the terminal requirements).
export function renderTimeReportHtml(data: TimeReportDocumentData): string {
  return samcisDocument(
    `${TITLE[data.kind]} ${data.student.name}`,
    `
  <style>${TIME_REPORT_CSS}</style>
  <div class="who">
    <p>Name: <strong>${escapeHtml(data.student.name)}</strong></p>
    <p><strong>Company</strong>: ${escapeHtml(data.company?.name)}</p>
  </div>
  ${renderTimeReportSection(data)}
  <p class="ref">Generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</p>`
  );
}
