import { escapeHtml, formatInstant, formatManilaDate, PRINT_CSS } from "@/lib/documents/html";
import { LETTER_CSS, renderLetterhead } from "@/lib/documents/letterhead";

export interface EndorsementLetterData {
  studentProfileId: string;
  referenceCode: string;
  endorsementDate: Date;
  student: {
    fullName: string;
    studentNumber: string;
    program: string;
    positionTitle: string | null;
    requiredHours: number;
  };
  company: {
    name: string;
    address: string;
    supervisorName: string;
    supervisorPosition: string | null;
  };
}

// FR-DG-01: student name, student ID, company name/address, supervisor
// name/position, endorsement date, institutional letterhead.
export function renderEndorsementLetterHtml(data: EndorsementLetterData): string {
  const position = data.company.supervisorPosition
    ? `${escapeHtml(data.company.supervisorPosition)}<br />`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Endorsement Letter ${escapeHtml(data.referenceCode)}</title>
<style>${PRINT_CSS}${LETTER_CSS}</style>
</head>
<body>
  ${renderLetterhead()}
  <p class="ref">Ref. ${escapeHtml(data.referenceCode)}</p>
  <div class="letter">
    <p>${escapeHtml(formatManilaDate(data.endorsementDate))}</p>
    <p class="addressee">
      <strong>${escapeHtml(data.company.supervisorName)}</strong><br />
      ${position}${escapeHtml(data.company.name)}<br />
      ${escapeHtml(data.company.address)}
    </p>
    <p>Dear ${escapeHtml(data.company.supervisorName)},</p>
    <p>
      We are pleased to endorse <strong>${escapeHtml(data.student.fullName)}</strong>
      (Student No. ${escapeHtml(data.student.studentNumber)}), a ${escapeHtml(data.student.program)}
      student of Saint Louis University, for internship at ${escapeHtml(data.company.name)}${
        data.student.positionTitle ? ` as ${escapeHtml(data.student.positionTitle)}` : ""
      }. The internship requires the completion of ${escapeHtml(data.student.requiredHours)} hours
      in accordance with CHED CMO No. 104, Series of 2017.
    </p>
    <p>
      The student has completed all pre-deployment requirements of the department. We look forward
      to your guidance in this internship and thank you for the opportunity extended to our student.
    </p>
    <p class="closing">Respectfully,</p>
    <p><br /><br />Department Internship Coordinator<br />SAMCIS, Saint Louis University</p>
  </div>
  <footer>${escapeHtml(data.referenceCode)} · generated ${escapeHtml(formatInstant(data.endorsementDate))} · IDSMS-CIS</footer>
</body>
</html>`;
}
