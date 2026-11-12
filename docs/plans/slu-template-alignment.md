# SLU template alignment

> **Status (12 Nov 2026):** Done. PRs #161–#165 are merged. Of "Still outside IDSMS", items 1–3 were built in #169 (prefilled waiver PDF, notification of retraction with placement history, company visit record), and the intern home now asks for the certificate of completion within two weeks (item 4). The weekly report was aligned with the SLU template again after adviser feedback (#211).

Compared against the SAMCIS IT-MMA/CS-CAD templates Jay shared (Drive folder `templates`,
"final version"): OJT Documentation Guidelines, Weekly Work Report & JLE Templates, Technical
Report (IT 421/CS 331/MMA 421), Parental Consent / Waiver, FM-VAA-052 HTE Evaluation Form, the
SAMCIS advisory on non-partner HTEs and SAMPLE WORKPLAN.pdf. Page sizes and fonts were read
from the PDFs with pdfplumber.

## Built (PRs #161-#165, stacked)

| SLU document                                                                               | IDSMS                                                                                                    | PR   |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---- |
| Weekly Work Report (8.5x13 in, Calibri 11)                                                 | SLU layout, totals inside the time record, supervisor signature                                          | #161 |
| Report on Off-duty (OT) Hours, Report on Under Time Hours                                  | Separate PDFs, per week or for the whole internship                                                      | #161 |
| Absence Report (optional, no SLU template)                                                 | Separate PDF in the same style: leave requests plus Absent days with no leave filed                      | #161 |
| File names (`WWR01 LastnameFirstname.pdf`, `JLEJan ...`, `Surname_OJTTechnicalReport.pdf`) | Every download; OT/UT/absence, FM-VAA-052 and work plan follow the same pattern                          | #161 |
| Journal on Learning Experience (monthly, not noted by supervisor)                          | Intern writes it in IDSMS; SLU's JLE page, no signature; office kept on the profile                      | #162 |
| FM-VAA-052 (A4, Century Gothic)                                                            | The intern's company evaluation, item for item; printable 5 pages with the document-control box          | #163 |
| Technical Report (8.5x13 in, Cambria 12, 1.5 spacing)                                      | SLU's outline and title page, exact table of contents, both assessments, appendix checklist              | #164 |
| Advisory: DTI, SEC, work plan for a non-partner HTE; legitimacy proof abroad               | Checklist applies DTI/SEC or proof of legitimacy only to a non-partner HTE                               | #165 |
| SAMPLE WORKPLAN                                                                            | Work plan rows (period, area, tasks, output, hours) and a printable default with the certification block | #165 |

Stand-in fonts: Carlito for Calibri and Caladea for Cambria (same widths), Didact Gothic for
Century Gothic (closest free face). Vercel's Chromium has none of SLU's fonts.

## Decisions taken on SLU's behalf (check with the coordinator)

- The technical report's title page copies SLU's template word for word, including "the School
  of Accountancy, Business, Computing and Information Studies" and "St. Louis University".
  Department names by program (Information Technology, Computer Science, Multimedia Arts) and
  course numbers (IT 421, CS 331, MMA 421) come from the template's header line.
- "Partner HTE" = a company with an MOA that is approved and active or expiring.
- The company flag `isForeign` now means "outside the Philippines" (the advisory's wording)
  rather than "foreign-owned".
- The JLE keeps the old monthly gate: every week in the month approved or regarded.

## Still outside IDSMS (could be built next)

1. **Parental Consent / Waiver and Undertaking**: a prefilled PDF (US Letter, Calibri) with
   the student's name, program, term, and the HTE's name and address, two copies per SLU's
   note. Today the checklist only records that it was handed in.
2. **Notification of retraction**: the guidelines require one (noted by SAMCIS) when an
   intern stops working at the HTE. IDSMS has no retraction or transfer record.
3. **Company visit**: SAMCIS must visit before the internship ends. IDSMS has no visit record
   for the adviser.
4. **Certificate of completion within two weeks** (FM-VAA-052 item 16): tracked only as an
   appendix checkbox; a reminder to the coordinator two weeks after completion is possible.
5. Google Classroom stays the place for signed copies and announcements (decision D7).
