import { escapeHtml } from "@/lib/documents/html";
import { fontFaces } from "@/lib/documents/fonts";

// The SAMCIS IT-MMA/CS-CAD print house style, measured from SLU's own templates
// (Weekly Work Report & JLE, OJT Documentation Guidelines): 8.5 x 13 in long bond,
// Calibri 11, 0.6 in side margins, a three-line centred department header.
export const SAMCIS_HEADER = `
  <header class="samcis">
    <p><strong>School of Accountancy, Management, Computing and Information Studies</strong></p>
    <p><strong>IT-MMA/CS-CAD Department</strong></p>
    <p>Saint Louis University, Baguio City</p>
  </header>`;

export function samcisCss(): string {
  return `${fontFaces("Calibri", "Cambria")}
  @page { size: 8.5in 13in; margin: 0.4in 0.6in 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 11pt; color: #000; margin: 0; line-height: 1.25; }
  p { margin: 0; }
  header.samcis { text-align: center; margin-bottom: 0.25in; }
  .title { text-align: center; margin-bottom: 0.35in; }
  .title h1 { font-size: 11pt; font-weight: bold; margin: 0; }
  .who { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 0.3in; }
  table.grid { border-collapse: collapse; width: 100%; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; }
  table.grid th { text-align: center; font-weight: bold; }
  table.grid td.num { text-align: center; white-space: nowrap; }
  tr { break-inside: avoid; }
  .text { white-space: pre-wrap; }
  h2.report { font-family: Cambria, Caladea, Georgia, serif; font-size: 11pt; margin: 0 0 10px; }
  h2.report .hint { font-weight: normal; font-style: italic; text-decoration: underline; }
  .sign { width: 3.2in; margin: 0.6in 0 0 auto; text-align: center; }
  .sign .line { border-top: 1px solid #000; padding-top: 2px; }
  .note { font-size: 10pt; }
  .ref { margin-top: 0.3in; font-size: 8pt; color: #555; text-align: center; }
  .watermark { color: #b45309; font-weight: bold; letter-spacing: 3px; text-align: center; }
  .page { break-before: page; }
`;
}

// Right-aligned signature block, as on the WWR: a line, the supervisor's name, the date.
export function supervisorSignature(supervisor: string | null | undefined, dated = "Date signed") {
  return `
  <div class="sign">
    <div class="line">${escapeHtml(supervisor)}</div>
    <div>${dated}</div>
  </div>`;
}

export function samcisDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${samcisCss()}</style>
</head>
<body>
${SAMCIS_HEADER}
${body}
</body>
</html>`;
}

// --- File names (OJT Documentation Guidelines, "Submission (electronic)") ---

const lettersOnly = (s: string) => s.normalize("NFD").replace(/[^A-Za-z]/g, "");
// "Jun M." -> "Jun": middle initials ("M.", "M") are left out of file names.
const firstNames = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => !/^[A-Za-z]\.?$/.test(w))
    .join(" ");

// "Dela Cruz, Juan Miguel P." -> { last: "DelaCruz", first: "JuanMiguel" }. Without a
// comma the last word is the surname ("Juan Dela Cruz" can't be split reliably, so the
// Profile page asks for "Last, First M.").
export function nameParts(fullName: string): { last: string; first: string } {
  const [lastPart, rest] = fullName.includes(",")
    ? [fullName.slice(0, fullName.indexOf(",")), fullName.slice(fullName.indexOf(",") + 1)]
    : [
        fullName.trim().split(/\s+/).at(-1) ?? "",
        fullName.trim().split(/\s+/).slice(0, -1).join(" "),
      ];
  return { last: lettersOnly(lastPart), first: lettersOnly(firstNames(rest.trim())) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// SLU: "WWR01 LastnameFirstname.pdf", "JLEJan LastnameFirstname.pdf",
// "Surname_OJTTechnicalReport.pdf". The OT, UT and absence reports and the HTE form
// have no SLU name, so they follow the same "<what> LastnameFirstname" pattern.
export function sluFileName(
  doc:
    | { kind: "WWR"; week: number }
    | { kind: "JLE"; month: string } // "YYYY-MM"
    | { kind: "TECHNICAL_REPORT" }
    | { kind: "OT" | "UT" | "ABSENCE"; week?: number }
    | { kind: "HTE_EVALUATION" },
  fullName: string
): string {
  const { last, first } = nameParts(fullName);
  const who = `${last}${first}`;
  const wk = (n: number) => `WWR${String(n).padStart(2, "0")}`;
  switch (doc.kind) {
    case "WWR":
      return `${wk(doc.week)} ${who}.pdf`;
    case "JLE":
      return `JLE${MONTHS[Number(doc.month.slice(5, 7)) - 1]} ${who}.pdf`;
    case "TECHNICAL_REPORT":
      return `${last}_OJTTechnicalReport.pdf`;
    case "HTE_EVALUATION":
      return `FM-VAA-052 ${who}.pdf`;
    default: {
      const label = { OT: "OffDutyHours", UT: "UnderTimeHours", ABSENCE: "AbsenceReport" }[
        doc.kind
      ];
      return `${doc.week ? `${wk(doc.week)} ` : ""}${label} ${who}.pdf`;
    }
  }
}
