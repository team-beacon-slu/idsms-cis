import { escapeHtml, formatCalendarDate, formatInstant } from "@/lib/documents/html";
import { samcisDocument } from "@/lib/documents/slu";

export interface RetractionNoticeData {
  student: { name: string; studentNumber: string; program: string };
  company: { name: string; address: string; supervisorName: string };
  startedOn: Date;
  lastDay: Date;
  reason: string;
  filedAt: Date;
  notedAt: Date | null;
  notedBy: string | null;
}

// The notification of retraction the SLU guidelines ask for (IV.1.e: "to be noted by
// SAMCIS"), printed for signatures: the intern, the HTE (received) and SAMCIS (noted).
export function renderRetractionHtml(d: RetractionNoticeData): string {
  const line = (label: string, name = "", date = "") => `
    <div style="display:grid;grid-template-columns:1fr 1.6in;gap:0.4in;margin-top:0.55in">
      <div><div style="border-top:1px solid #000;padding-top:2px;text-align:center">${escapeHtml(name || null)}</div>
      <div style="text-align:center">${label}</div></div>
      <div><div style="border-top:1px solid #000;padding-top:2px;text-align:center">${escapeHtml(date || null)}</div>
      <div style="text-align:center">Date</div></div>
    </div>`;
  return samcisDocument(
    `Notification of Retraction ${d.student.name}`,
    `
  <div class="title"><h1>Notification of Retraction</h1></div>
  <p style="margin-bottom:12pt">To SAMCIS, through the faculty adviser:</p>
  <p style="text-align:justify;line-height:1.6">
    I, <strong>${escapeHtml(d.student.name)}</strong> (${escapeHtml(d.student.studentNumber)}, ${escapeHtml(d.student.program)}),
    an intern of <strong>${escapeHtml(d.company.name)}</strong>, ${escapeHtml(d.company.address)}, since
    ${escapeHtml(formatCalendarDate(d.startedOn))}, give notice that I will stop working at this Host Training
    Establishment after <strong>${escapeHtml(formatCalendarDate(d.lastDay))}</strong>, for the following reason:
  </p>
  <p class="text" style="margin:12pt 0.3in;text-align:justify">${escapeHtml(d.reason)}</p>
  ${line("Student's Signature over Printed Name", d.student.name)}
  <p style="margin-top:0.45in"><em>For company personnel only:</em> Received</p>
  ${line("HTE Representative, Signature over Printed Name", d.company.supervisorName)}
  <p style="margin-top:0.45in"><em>For SAMCIS:</em> Noted</p>
  ${line("Signature over Printed Name", d.notedBy ?? "", d.notedAt ? formatCalendarDate(d.notedAt) : "")}
  <p class="ref">Filed through IDSMS-CIS on ${escapeHtml(formatInstant(d.filedAt))}</p>`
  );
}
