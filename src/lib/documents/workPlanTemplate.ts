import { escapeHtml, formatInstant } from "@/lib/documents/html";
import { fontFaces } from "@/lib/documents/fonts";
import type { WorkPlanRow } from "@/lib/validators/workPlan";

export interface WorkPlanDocumentData {
  student: { name: string };
  company: { name: string; supervisorName: string } | null;
  rows: WorkPlanRow[];
  status: string;
  generatedAt: Date;
}

const lines = (text: string | undefined) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div class="task">${escapeHtml(l)}</div>`)
    .join("");

const hrs = (h: number) => `${Math.round(h * 100) / 100} Hours`;

// The work plan as SAMCIS's sample lays it out ("Template depends on the company": this
// is the default for a company without its own). Period, Area/Topic, Specific Tasks,
// Expected Output, hours; the total excludes overtime; the trainee and supervisor sign at
// the conclusion of the OJT.
export function renderWorkPlanHtml(data: WorkPlanDocumentData): string {
  const total = data.rows.reduce((sum, r) => sum + (r.hours ?? 0), 0);
  const rows = data.rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.period)}</td>
        <td class="center">${escapeHtml(r.area)}</td>
        <td>${lines(r.description)}</td>
        <td>${escapeHtml(r.output)}</td>
        <td class="center">${r.hours == null ? "—" : hrs(r.hours)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Work Plan ${escapeHtml(data.student.name)}</title>
<style>
  ${fontFaces("Calibri")}
  @page { size: A4; margin: 0.7in 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 9.5pt; color: #000; margin: 0; }
  h1 { font-size: 13pt; margin: 0; }
  p { margin: 0 0 6pt; }
  .who { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 24pt; margin: 10pt 0 12pt; font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #555; padding: 3pt 5pt; vertical-align: top; text-align: left; }
  th { background: #dce6f1; text-align: center; }
  td.center { text-align: center; }
  .task { border-bottom: 1px solid #c9d7a8; background: #f2f7e6; padding: 1pt 2pt; }
  .task:last-child { border-bottom: none; }
  tr { break-inside: avoid; }
  .total td { font-weight: bold; }
  .cert { margin-top: 18pt; font-size: 10.5pt; font-weight: bold; }
  .sig { display: grid; grid-template-columns: 1.6in 2in 0.6in 1.6in; gap: 10pt 6pt; align-items: end; margin: 10pt 0 16pt; }
  .line { border-bottom: 1px solid #000; height: 14pt; }
  .ref { margin-top: 18pt; font-size: 7.5pt; color: #666; }
</style>
</head>
<body>
  <h1>WORK PLAN</h1>
  <div class="who">
    <p><strong>Trainee:</strong> ${escapeHtml(data.student.name)}</p>
    <p><strong>Host Training Establishment:</strong> ${escapeHtml(data.company?.name)}</p>
    <p><strong>Supervisor:</strong> ${escapeHtml(data.company?.supervisorName)}</p>
    <p><strong>Status in IDSMS:</strong> ${escapeHtml(data.status)}</p>
  </div>
  <table>
    <colgroup><col style="width: 17%" /><col style="width: 17%" /><col style="width: 30%" /><col style="width: 24%" /><col style="width: 12%" /></colgroup>
    <thead><tr><th>Period</th><th>Area/Topic</th><th>Specific Tasks</th><th>Expected Output</th><th>No. of hours spent</th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td colspan="4" style="text-align: right">Total Hours (Overtime not included)</td><td class="center">${hrs(total)}</td></tr>
    </tbody>
  </table>

  <p class="cert">At the conclusion of the OJT, the trainee and supervisor must sign below to certify the training is completed. A copy of this document must be provided to the trainee and included in their training file.</p>
  <div class="sig">
    <strong>Trainee Signature:</strong><div class="line"></div><strong>Date:</strong><div class="line"></div>
    <strong>Supervisor Signature:</strong><div class="line"></div><strong>Date:</strong><div class="line"></div>
  </div>
  <p class="cert">Upon conclusion of the OJT</p>
  <p class="cert" style="margin-top: 0">The supervisor below has discussed this document with the trainee and the supervisor understands the trainee's performance level.</p>
  <div class="sig">
    <strong>Supervisor Signature:</strong><div class="line"></div><strong>Date:</strong><div class="line"></div>
  </div>
  <p class="ref">Generated ${escapeHtml(formatInstant(data.generatedAt))} · IDSMS-CIS</p>
</body>
</html>`;
}
