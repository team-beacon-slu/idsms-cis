# 09. Security and privacy

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 12 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

IDSMS processes students' personal data, so it must comply with the **Data Privacy Act of 2012 (RA 10173)**, its implementing rules and SLU's data privacy policy. This document lists the measures in place, in plain language. Technical details are in [08. Technical design](08-technical-design.md).

## 1. Principles

1. **Collect only what internship management needs** (data minimisation, NFR-DP-04).
2. **Keep sensitive documents out of IDSMS** (decisions D2 and D7).
3. **Need-to-know access**, checked on the server for every request (NFR-SEC-01, FR-UM-09).
4. **Every sensitive action leaves a trace** that nobody can alter (NFR-SEC-07, NFR-SEC-10).
5. **People can see their own data** (NFR-DP-07), and old data is reviewed, not kept forever (NFR-DP-06, NFR-DP-08).

## 2. No sensitive documents (D2 and D7)

| What                                                                                               | Where it lives                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Supervisor-signed weekly/monthly reports, signatures                                               | Google Classroom (D2, PR #80 removed the signed-copy upload)                                                                           |
| Medical certificates, psychological clearance, parent's consent and other pre-deployment documents | Google Classroom (D7, PR #85: the checklist records status only)                                                                       |
| Post-internship certificates (CPO attendance, HTE completion)                                      | Google Classroom; status tracking is **Planned** (H)                                                                                   |
| Proof for leave, overtime and undertime                                                            | Today: optional upload on deviation reports. L1 proposes Google Classroom only, with IDSMS tracking status; pending confirmation (Q19) |
| Wet-signed MOA                                                                                     | Today: an MOA can be a Drive link or a PDF. **Planned**: Drive link and status only, no upload                                         |

IDSMS keeps only the **status** (Pending, Approved, Returned), who reviewed it and when, and the reviewer's note.

## 3. What data is stored where

| Data                                                               | Stored in                                  | Who can see it                                               |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| Email, role, password hash (bcrypt), lockout state                 | Database (`users`)                         | Staff (Users page shows email, role, status; never the hash) |
| Student number, program, class group, company, hours, legal name   | Database (`student_profiles`)              | The student, assigned faculty, coordinator, Super Admin      |
| Daily time records, accomplishments, weekly/monthly report history | Database                                   | The student, assigned faculty, coordinator, Super Admin      |
| Checklist status and reviewer notes                                | Database                                   | The student, assigned faculty, coordinator, Super Admin      |
| Companies and supervisor contact                                   | Database                                   | Any signed-in user (company details are not sensitive)       |
| MOA records                                                        | Database; optional PDF in a private bucket | Faculty, coordinator, Super Admin only (FR-MOA-07)           |
| Generated PDFs                                                     | Private storage bucket                     | The student and authorised staff, via 5-minute signed links  |
| Deviation proof files (still uploadable; see Q19)                  | Private storage bucket                     | The student and authorised staff, via 5-minute signed links  |
| Notifications                                                      | Database                                   | The recipient                                                |
| Audit log (actions, IP addresses)                                  | Database (`audit_logs`)                    | Super Admin                                                  |
| Data requests                                                      | Database                                   | The requester (own status), Super Admin                      |

During development the database and files are on Supabase (cloud) and the app on Vercel. In Phase 5 (**Planned**) everything moves to a dedicated SAMCIS lab computer.

## 4. Access control

- **Four roles** with a role check on every page and every server action.
- **Record-level checks:** students see only their own records; faculty advisers only students in their assigned class groups for that semester; crafted requests for other students are refused (FR-UM-09).
- **Default-deny database security (RLS):** every table has Row Level Security enabled with no policies, so the Supabase public key, if ever leaked, could read nothing (migration 002, NFR-SEC-11). Real authorisation is enforced by the application.
- **Private file storage:** files are never public; the app checks access, then issues a link valid for 5 minutes (NFR-SEC-03).
- **Server-only secrets:** storage and database keys never reach the browser.
- **Safe exports:** spreadsheet cells that could run as formulas are neutralised; exports never contain passwords, tokens or file paths.
- **Safe links:** notification links can only point inside IDSMS.

## 5. Sessions, passwords and lockout

| Measure            | Rule                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session lifetime   | 30 minutes of inactivity (FR-UM-06). Sessions are stored in the database, so they can be ended instantly.                                                                           |
| Instant revocation | Lockout, deactivation, forced logout and password reset end all of a user's sessions at once (FR-UM-11).                                                                            |
| Lockout            | 5 consecutive wrong passwords lock the account for 15 minutes (FR-UM-07, FR-UM-10). Hardened against concurrent attempts (PR #84).                                                  |
| First login        | A new password must be set before anything else (FR-UM-04).                                                                                                                         |
| Default passwords  | Derived from the student number with a secret key; shown once to the importer; never emailed (FR-UM-03).                                                                            |
| Password reset     | One-hour link; only a hash of the token is stored (FR-UM-10).                                                                                                                       |
| Re-authentication  | Exports, data request exports, file deletion and bulk endorsement letters ask for the password again; wrong attempts count toward lockout (NFR-SEC-05). MFA (FR-UM-05) is deferred. |
| Cookies            | HttpOnly; Secure under HTTPS (NFR-SEC-08).                                                                                                                                          |
| Transport          | HTTPS (NFR-SEC-02).                                                                                                                                                                 |

## 6. Audit log immutability

The audit log records sign-in attempts (successful, failed, locked, inactive), role and account changes, checklist and work plan decisions, report submissions and returns, settings changes, semester changes, exports, data requests and retention decisions, with user, time, IP address and the affected record.

**It cannot be edited or deleted, even by the system itself** (NFR-SEC-10):

- Migration 001 added Row Level Security policies that forbid UPDATE and DELETE.
- **Why that was not enough:** the application connects as the database owner role, which **bypasses RLS entirely**. The policies would never apply to the app's own connection.
- Migration 007 therefore adds **database triggers** that reject any UPDATE, DELETE or TRUNCATE on `audit_logs` for **every** role, including the owner. Triggers fire regardless of RLS. Inserting new entries still works.
- The migration includes verification queries showing that UPDATE, DELETE and TRUNCATE fail and INSERT succeeds.
- Consequence: user accounts are never hard-deleted (that would require updating audit rows); they are deactivated.

## 7. Data subject access requests (DSAR)

- Any user can click **Request my data** on their Profile page (NFR-DP-07). One open request per user, enforced by the database.
- The request is due **15 days** later. Super Admins are notified immediately and reminded daily from 3 days before the due date, including when overdue.
- The Super Admin exports the person's data (password required) as an Excel workbook containing what the person generated or is the subject of, including report histories, and excluding credentials, lockout counters, tokens and file paths. The Super Admin then marks the request fulfilled.
- Every step is recorded in the audit log.

## 8. File retention

- Generated PDFs and uploaded files are kept for **3 years after the end of their semester** (NFR-DP-08).
- Every 90 days the daily job flags older files for review; Super Admins are notified.
- The Super Admin chooses **Keep** or **Delete** for each file. Deletion requires the password and is audited. **Nothing is deleted automatically** (NFR-DP-06).
- Archiving a semester deletes nothing; history is kept for audit and accreditation (FR-DB-07).

## 9. Exports

- Six Super Admin exports in the Export Center, each requiring the password and each audited (`DATA_EXPORTED`).
- Faculty and coordinators can export compliance tables for the students they are allowed to see.
- The audit log can be exported by the Super Admin (up to 10,000 rows).

## 10. Third parties

| Service            | Data sent                                                         | Status                                             |
| ------------------ | ----------------------------------------------------------------- | -------------------------------------------------- |
| Vercel, Supabase   | Hosting of the app, database and files                            | **Built** (development); replaced in Phase 5       |
| Resend (email)     | Recipient email, notification text                                | **Built**, active only with a sending domain (Q15) |
| Google Gemini (AI) | Report text with names removed, only with approval under RA 10173 | **Planned**, optional (Q16); disabled by default   |

## 11. Open points

- Q15: sending email domain from SLU.
- Q16: approval to send anonymised report text to Google's AI.
- Q17: who manages the lab computer in Phase 5 (backups, updates, physical security).
- Phase 5 hardening: secrets rotation before the pilot, re-verifying the audit-log triggers on the new database, nightly off-site backups with a tested restore, and cleaning test accounts from the shared development database.
- **Consent (FR-CK-05 / NFR-DP-03) is handled under D7:** consent forms such as the Parent's Consent and Undertaking and the Data Privacy orientation are submitted in Google Classroom, and IDSMS records only their status as checklist items. No separate consent capture is built.
- Q19: whether leave, OT and UT proof stays as an upload or moves to Google Classroom.
