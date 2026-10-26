# SLU template alignment: what IDSMS still differs on

Compared on 26 Oct 2026 against the SAMCIS IT-MMA/CS-CAD templates Jay shared (Drive folder
`templates`): OJT Documentation Guidelines, Weekly Work Report & JLE Templates, Technical Report
(IT 421/CS 331/MMA 421), Parental Consent / Waiver, and FM-VAA-052 HTE Evaluation Form.

## Already matches

| SLU document                                                                                                                          | IDSMS                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Weekly Work Report: Week No. + dates, daily times, hours, accomplishments, totals rendered / beginning / ending, supervisor signature | `weeklyReportTemplate.ts` has all of these                                   |
| Report on Off-duty (OT) Hours and on Under Time Hours                                                                                 | Same PDF, own tables and signature lines                                     |
| Parental Consent / Waiver and Undertaking                                                                                             | Checklist item `PARENT_CONSENT_UNDERTAKING` (file stays in Google Classroom) |
| Required hours: BSIT 600, BSCS 240-320, BMMA 500                                                                                      | Per-program setting (`/settings`, required hours)                            |

## Gaps, largest first

1. **Journal on Learning Experience (JLE), monthly.** SLU wants a narrative: observations,
   problems and solutions, accomplishments, mistakes, skills learned. It is _not_ noted by the
   supervisor. IDSMS's monthly report is a table of weekly hours with student and supervisor
   signature lines. Fix: replace it with a JLE narrative (student writes, adviser reads), no
   supervisor signature.
2. **Technical Report (final).** IDSMS has five free-text sections (company overview,
   introduction, work accomplished, learnings, recommendations). SLU's structure:
   - Company profile: basic info table (company, department, supervisors and designations,
     start/end dates), description, office environment/culture.
   - Company resources: hardware (company-wide, at work); software used (OS, productivity,
     development tools, others).
   - Internship program: task list, main accomplishments, challenges faced (A, B, C rows),
     learning/growth (personality/social, technical, other professional, professional work).
   - Assessment: work assessment (12 items, Extensive 4 to Rare/None 1) and self-assessment
     (10 items, Very Good 4 to Poor 1), each with remarks.
   - Miscellany: areas for improvement; program (helpful courses, wished-for skills).
   - Appendix: signed WWRs, proof of attendance, photos, certificate of completion,
     DPO certificate of participation, FM-VAA-052.
   - Format: legal paper, Times New Roman or Cambria 12, 1-inch margins, 1.5 spacing, each
     section on a new page, SLU title page.
3. **HTE evaluation.** IDSMS asks 7 research-based criteria on 1-5. SLU's form FM-VAA-052 has
   16 CMO 104 obligations (4-level implementation scale), 6 internship-quality items
   (Highly Satisfactory to Not Satisfactory) and comments A-C. The AI plan already said to use
   SLU's own form when one exists; existing ratings would need a mapping or a cut-over.
4. **File names.** SLU: `WWR01 LastnameFirstname.pdf`, `JLEJan LastnameFirstname.pdf`,
   `Surname_OJTTechnicalReport.pdf`. IDSMS serves PDFs inline under storage keys. Fix: a
   `Content-Disposition` filename on the download route.
5. **Absence report** (optional in SLU's guidelines): IDSMS records absences as leave
   requests but prints no absence table on the weekly report.

Each of these changes a document students hand in, so the coordinator should confirm the
template version for the term before it is built.
