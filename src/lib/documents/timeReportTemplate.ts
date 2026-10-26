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
  // The week this report goes with, or null for the whole internship (terminal requirement).
  week: { number: number; start: Date; end: Date } | null;
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

// SLU "Report on Overtime Hours" / "Report on UNDER TIME Hours" (WWR & JLE templates,
// page 2), and an absence report in the same style (the guidelines make it optional,
// with no SLU template). Printed on its own so it can be attached to the week's WWR or,
// for the whole internship, to the terminal requirements.
export function renderTimeReportHtml(data: TimeReportDocumentData): string {
  const total = data.rows.reduce((sum, r) => sum + r.minutes, 0);
  const scope = data.week
    ? `Week No. ${data.week.number} (${shortDate(data.week.start)} – ${shortDate(data.week.end)})`
    : "Whole internship";
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

  let title: string;
  let table: string;
  if (data.kind === "OT") {
    title = "Report on Overtime Hours";
    table = `
    <thead><tr><th>Date</th><th>Time in – Time Out</th><th>Hours Rendered</th><th>Remarks<br /><em style="font-weight: normal">reasons for off-duty work, with proof</em></th></tr></thead>
    <tbody>${timeRows || none("overtime")}${totalRow("TOTAL OT Hours")}</tbody>`;
  } else if (data.kind === "UT") {
    title = "Report on UNDER TIME Hours";
    table = `
    <thead><tr><th>Date</th><th>UNDERTIME HOURS</th><th>Total UT Hours</th><th>Remarks<br /><em style="font-weight: normal">reasons for under time, with proof</em></th></tr></thead>
    <tbody>${timeRows || none("under time")}${totalRow("TOTAL UT Hours")}</tbody>`;
  } else {
    title = "Report on Absences";
    const days = (a: AbsenceRow) =>
      a.endDate && a.endDate > a.date
        ? `${escapeHtml(dayLabel(a.date))} to ${escapeHtml(dayLabel(a.endDate))}`
        : escapeHtml(dayLabel(a.date));
    const rows = data.absences
      .map(
        (a) => `
      <tr>
        <td>${days(a)}${a.startTime ? `<br />${timeRange(a.startTime, a.endTime)}` : ""}</td>
        <td>${a.kind === "ANTICIPATED" ? "Leave (filed ahead)" : a.kind === "EMERGENCY" ? "Emergency leave" : "Absent (no leave filed)"}</td>
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

  return samcisDocument(
    `${title} ${data.student.name}`,
    `
  <style>table.grid { margin: 0 auto; width: 6.6in; } h2.report { margin-left: 0.3in; }</style>
  <div class="who">
    <p>Name: <strong>${escapeHtml(data.student.name)}</strong></p>
    <p><strong>Company</strong>: ${escapeHtml(data.company?.name)}</p>
  </div>
  <h2 class="report">${title} <span class="hint">(${scope})</span></h2>
  <table class="grid">${table}
  </table>
  ${data.kind === "ABSENCE" ? '<p class="note" style="margin: 0.15in 0.3in 0">Inform your supervisor whenever you cannot go to work, and your faculty adviser through your supervisor.</p>' : ""}
  <div class="sign"><div class="line">${escapeHtml(data.company?.supervisorName)}, Date</div></div>
  <p class="ref">Generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</p>`
  );
}
