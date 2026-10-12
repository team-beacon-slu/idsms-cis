# 13. App flow

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 13 October 2026. Status labels: **Built**, **In progress**, **Planned** (see the [index](README.md))._

This document shows how people move through IDSMS: the screen map per role, the main user flows, the life cycle (states) of each important record, and the key behind-the-scenes sequences. Everything is derived from the code (`src/app/**`, `src/app/(dashboard)/dashboard-nav.tsx`, `src/lib/services/**`). Planned and in-progress parts are marked. Each flow describes the system's intended behaviour; it is not based on usability testing, which is planned for Phase 5.

Related documents: [02. Internship lifecycle](02-internship-lifecycle.md) (the business journey), [08. Technical design](08-technical-design.md) (API routes), [14. Data schema](14-data-schema.md) (the records behind the states).

## 1. Screen map

### 1.1 Navigation per role

The left menu is built in `dashboard-nav.tsx`. Every role also has the notification bell (opens `/notifications`) and **Sign out**.

| Menu item       | Path                   | Student | Faculty | Coordinator | Super Admin |
| --------------- | ---------------------- | :-----: | :-----: | :---------: | :---------: |
| Dashboard       | `/`                    |   Yes   |   Yes   |     Yes     |     Yes     |
| Users           | `/users`               |         |         |     Yes     |     Yes     |
| Semesters       | `/semesters`           |         |         |  View only  |     Yes     |
| Audit log       | `/audit-log`           |         |         |             |     Yes     |
| Export Center   | `/admin/export-center` |         |         |             |     Yes     |
| Companies       | `/companies`           |   Yes   |   Yes   |     Yes     |     Yes     |
| Calendar        | `/calendar`            |   Yes   |   Yes   |     Yes     |     Yes     |
| My Students     | `/my-students`         |         |   Yes   |             |             |
| Checklist       | `/checklist`           |   Yes   |         |             |             |
| Work Plan       | `/work-plan`           |   Yes   |         |             |             |
| Attendance      | `/attendance`          |   Yes   |         |             |             |
| Weekly Reports  | `/weekly-reports`      |   Yes   |         |             |             |
| Monthly Reports | `/monthly-reports`     |   Yes   |         |             |             |
| Profile         | `/profile`             |   Yes   |   Yes   |     Yes     |     Yes     |

The student shortcuts (`/checklist`, `/work-plan`, `/attendance`, `/weekly-reports`, `/monthly-reports`) redirect to the student's own pages under `/students/{studentProfileId}/…`, which staff reach from dashboards, My Students or Users.

### 1.2 Sitemap

```mermaid
graph LR
    subgraph Public
        L["/login"]
        RP["/auth/reset-password"]
        RPT["/auth/reset-password/[token]"]
    end
    CP["/change-password<br/>(forced on first login)"]
    L --> CP
    RP --> RPT --> L
    CP --> D

    D["/ Dashboard<br/>(role-specific)"]
    D --> N["/notifications"]
    D --> PR["/profile"]
    D --> CAL["/calendar"]
    D --> CO["/companies"]
    CO --> CON["/companies/new"]
    CO --> COI["/companies/[id]"]
    COI --> MOA["/companies/[id]/moa/new<br/>(staff)"]

    subgraph Student_record["Student record /students/[studentProfileId]/…"]
        SC["checklist"]
        SWP["work-plan"]
        SA["attendance"]
        SW["weekly-reports"]
        SWV["weekly-reports/[id]/preview"]
        SWR["weekly-reports/[id]/review<br/>(faculty)"]
        SM["monthly-reports"]
        SW --> SWV
        SW --> SWR
    end
    D --> SC
    D --> SW

    subgraph Staff
        U["/users"]
        UI["/users/import"]
        SEM["/semesters"]
        MS["/my-students (faculty)"]
        AL["/audit-log (SA)"]
        EC["/admin/export-center (SA)"]
        U --> UI
    end
    D --> U
    D --> MS
    MS --> SC
    D --> AL
    D --> EC

    LT["Leave & Time Requests tab<br/>(In progress, L1)"]
    D -.-> LT
```

### 1.3 Screen inventory and states

| Screen                                    | Role(s)                              | Main states shown                                                                                                                                         |
| ----------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                                  | Public                               | Default; error message for wrong password, locked account (with time), inactive account                                                                   |
| `/change-password`                        | Signed in                            | Forced ("Set a new password") or voluntary ("Change your password"); validation errors                                                                    |
| `/auth/reset-password`, `/[token]`        | Public                               | Request sent; invalid or expired link; new password set                                                                                                   |
| `/` (Dashboard)                           | All                                  | Student: "Needs attention" card only when something needs action; final report cover locked/unlocked. Staff: empty tables when no students; filters       |
| `/checklist` → `/students/{id}/checklist` | Student, staff                       | Per item Pending / Approved / Returned (with note); "Tracked automatically" for Work Plan and MOA; endorsement letter locked until 9/9, then downloadable |
| `/work-plan`                              | Student, staff                       | No plan; Submitted; Approved (locked); Returned with reviewer feedback; history                                                                           |
| `/attendance`                             | Student, staff                       | "The work schedule can be set once the work plan is approved"; schedule set; schedule change pending; pending hours line only when > 0                    |
| `/weekly-reports`                         | Student, staff                       | "No weekly reports yet"; Draft; "Submitted · awaiting review"; Returned; Approved / Regarded; PDF Generated / Failed (Regenerate)                         |
| `/weekly-reports/[id]/review`             | Faculty                              | Read-only report with late reason; four action buttons; Return needs a note                                                                               |
| `/monthly-reports`                        | Student, staff                       | "No weekly reports yet — monthly reports roll up approved weekly reports"; eligible month; submitted with PDF                                             |
| `/companies`, `/companies/[id]`           | All (MOA section staff only)         | "No companies found"; MOA list with status badges and allowed next statuses; verified flag                                                                |
| `/users`, `/users/import`                 | Coordinator, Super Admin             | Locked / inactive badges; import result with failed rows and a credentials download                                                                       |
| `/semesters`                              | Coordinator (read-only), Super Admin | "No semesters yet"; active; archived ("Read-only")                                                                                                        |
| `/audit-log`                              | Super Admin                          | "No matching entries"; filtered list                                                                                                                      |
| `/admin/export-center`                    | Super Admin                          | Export cards; inline password form; "No exports yet"; data requests with days left (overdue in red); retention flags                                      |
| `/notifications`                          | All                                  | Unread / read; empty                                                                                                                                      |
| `/profile`                                | All                                  | Legal name (students); "Your data" request open / none                                                                                                    |

## 2. User flows

### 2.1 Sign-in, password reset and lockout (Built)

```mermaid
flowchart TD
    A([Open IDSMS]) --> B{Session cookie?}
    B -- Yes --> C{Session valid<br/>and account active?}
    B -- No --> L[/login/]
    C -- No --> L
    C -- Yes --> F{Must reset<br/>password?}
    L --> P[Enter email + password]
    P --> Q{Account locked<br/>until a time?}
    Q -- Yes --> QL["Show 'locked until …'<br/>(15 minutes)"]
    Q -- No --> R{Password correct?}
    R -- No --> S["Failed attempts + 1;<br/>audit LOGIN_FAILED"]
    S --> T{5 in a row?}
    T -- Yes --> U["Lock 15 min,<br/>end all sessions"]
    T -- No --> L
    R -- Yes --> V["Reset counter, create session,<br/>audit LOGIN_SUCCESS"]
    V --> F
    F -- Yes --> CP["/change-password"] --> D
    F -- No --> D([Dashboard])
    L --> RP["Forgot password?<br/>/auth/reset-password"]
    RP --> RL["Email with 1-hour link"]
    RL --> RN["Set new password;<br/>all sessions ended"]
    RN --> L
    QL -.-> SAU["Super Admin can Unlock"]
```

Notes: sessions expire after 30 minutes of inactivity. A reset does not lift a lock early.

### 2.2 Student (Built, with L1 changes marked)

```mermaid
flowchart TD
    S0([First login]) --> S1["Profile: set legal name"]
    S1 --> S2["Checklist: see status of 9 items<br/>(files go to Google Classroom)"]
    S2 --> S3["Companies: register host company"]
    S3 --> S4["Work Plan: submit planned tasks"]
    S4 --> S5{Coordinator<br/>decision}
    S5 -- Returned --> S4
    S5 -- Approved --> S6["Attendance: set working days<br/>and hours per day"]
    S6 --> S7["Wait for endorsement letter<br/>(all 9 items Approved)"]
    S7 --> W1["Weekly Reports: start the week"]
    W1 --> W2["Each day: Present / Absent / Holiday,<br/>time in/out, hours, accomplishments"]
    W2 --> W3["Preview"]
    W3 --> W4{"Past Tuesday<br/>11:59 PM Manila?"}
    W4 -- Yes --> W5["Enter reason for delay"] --> W6
    W4 -- No --> W6["Submit → reference code WR-…"]
    W6 --> W7{Faculty review}
    W7 -- Returned with note --> W2
    W7 -- Disregarded --> W1
    W7 -- "Approved / Regarded" --> W8["Hours confirmed;<br/>download PDF, supervisor signs,<br/>post in Google Classroom"]
    W8 --> M1{"All weeks of the month<br/>Approved/Regarded?"}
    M1 -- Yes --> M2["Monthly Reports: submit → MR-… PDF"]
    M1 -- No --> W1
    W8 --> FC{"Confirmed hours ≥<br/>final threshold?"}
    FC -- Yes --> FC2["Dashboard: generate final report cover (FC-…)"]
    S1 -.-> DR["Profile: Request my data<br/>(any time)"]
    W2 -.-> L1["In progress (L1): two time ranges,<br/>undertime gate, Leave & Time Requests"]
```

### 2.3 Faculty adviser (Built)

```mermaid
flowchart TD
    F0([Dashboard]) --> F1["Review queue: pending reviews,<br/>students needing attention"]
    F1 --> F2["Open weekly report review"]
    F2 --> F3{Decision}
    F3 -- Approve --> F4["Hours count; student notified"]
    F3 -- Regard --> F4
    F3 -- "Return (note required)" --> F5["Student revises and resubmits"]
    F3 -- Disregard --> F6["Report removed; student redoes the week"]
    F0 --> C1["Student checklist"]
    C1 --> C2["Check document in Google Classroom"]
    C2 --> C3{Record status}
    C3 -- Approve --> C4{"Work Plan / MOA item?"}
    C4 -- "Yes, underlying record not approved" --> C5["Blocked with message"]
    C4 -- "No, or record approved" --> C6["Approved; student notified"]
    C3 -- "Return (note required)" --> C7["Returned; student notified"]
    C6 --> E1{"All 9 Approved?"}
    E1 -- Yes --> E2["Generate endorsement letter (one student)"]
    F0 --> E3["Bulk endorsement for a class group"]
    E3 --> E4["Re-enter password"]
    E4 --> E5["Letters for eligible students (max 40);<br/>others skipped and listed"]
    F0 --> X1["Export to Excel / Weekly summary"]
    F0 --> A1["Student attendance: validate deviations;<br/>validate schedule change (step 1)"]
```

### 2.4 Coordinator (Built)

```mermaid
flowchart TD
    K0([Dashboard]) --> K1["Filter by semester, program, status;<br/>Export to Excel / Weekly summary"]
    K0 --> U1["Users → Import class list<br/>(choose class group + semester)"]
    U1 --> U2["Validation per row"]
    U2 --> U3["Download credentials sheet;<br/>hand out privately"]
    K0 --> CM1["Companies: register / edit / verify"]
    CM1 --> CM2["Add MOA record<br/>(Drive link or PDF, dates, programs)"]
    CM2 --> CM3["Move MOA through stages<br/>to Approved / Active"]
    CM3 --> CM4["Daily job warns before expiry"]
    K0 --> WP1["Student work plan: Approve / Return"]
    K0 --> SC1["Schedule change: final approval<br/>(after faculty step)"]
    K0 --> SM1["Semesters: view (read-only)"]
```

### 2.5 Super Admin (Built)

```mermaid
flowchart TD
    A0([Dashboard]) --> A1["Users: activate/deactivate,<br/>force logout, unlock, import"]
    A1 --> A2["Settings: required hours per program;<br/>reminder hours; MOA warning days"]
    A0 --> A3["Semesters: create, activate (one active),<br/>archive (keeps data)"]
    A0 --> A4["Audit log: filter, export (≤10,000 rows)"]
    A0 --> A5["Export Center"]
    A5 --> A6["Choose export + semester"]
    A6 --> A7["Re-enter password"] --> A8["Excel download; audit DATA_EXPORTED"]
    A5 --> D1["Data requests (soonest due first)"]
    D1 --> D2["Export person's data (password)"] --> D3["Give it to them; Mark fulfilled"]
    A5 --> R1["Files due for retention review"]
    R1 --> R2{Decision}
    R2 -- Keep --> R3["Flag KEPT"]
    R2 -- "Delete (password)" --> R4["File removed; flag DELETED"]
```

**Planned for the Super Admin and faculty:** class group & staff management screens (Q20), choosing required checklist items, the deduction matrix (L2).

## 3. State diagrams

### 3.1 Weekly report (Built)

The database enum `WeeklyReportStatus` has `PENDING, APPROVED, RETURNED, REGARDED, DISREGARDED`. "Draft" and "Submitted" are both stored as `PENDING`; the difference is the last lifecycle entry in `revisionHistory` (`SUBMITTED` or `RETURNED`). Dashboards display these derived states.

```mermaid
stateDiagram-v2
    [*] --> Draft: student starts the week<br/>(PENDING, no SUBMITTED entry)
    Draft --> Submitted: submit<br/>(PENDING + SUBMITTED entry,<br/>late flag, WR- code)
    Submitted --> Approved: faculty Approve
    Submitted --> Regarded: faculty Regard
    Submitted --> Returned: faculty Return (note)
    Submitted --> [*]: faculty Disregard<br/>(row deleted)
    Returned --> Submitted: student edits and resubmits
    Approved --> [*]
    Regarded --> [*]
    note right of Approved: Approved and Regarded are final;<br/>their hours are confirmed
```

### 3.2 Pre-deployment checklist item (Built, D7)

```mermaid
stateDiagram-v2
    [*] --> PENDING: created at import (9 per student)
    PENDING --> APPROVED: staff Approve<br/>(Work Plan/MOA need approved record)
    PENDING --> RETURNED: staff Return (note required)
    RETURNED --> APPROVED: staff Approve after fix in Google Classroom
    APPROVED --> RETURNED: staff Return (note required)
    RETURNED --> RETURNED: Return again with new note
```

### 3.3 Work plan (Built)

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED: student submits
    SUBMITTED --> APPROVED: coordinator/SA approve<br/>(locked; endorsement draft queued)
    SUBMITTED --> RETURNED: coordinator/SA return with comments
    RETURNED --> [*]: student submits a new work plan (new record)
    APPROVED --> [*]: changes need a new submission
```

Schedule changes are recorded inside the approved work plan (`scheduleChangeHistory`): `PENDING_FACULTY` → faculty approves (`PENDING_COORDINATOR`) or rejects → coordinator approves or rejects → `APPLIED` from then on.

### 3.4 MOA record (Built; `MoaStatus`, allow-list in `companyService.ts`)

```mermaid
stateDiagram-v2
    [*] --> DRAFTING
    DRAFTING --> PENDING
    PENDING --> FOR_HTE_REVIEW
    FOR_HTE_REVIEW --> FOR_UNIVERSITY_REVIEW
    FOR_UNIVERSITY_REVIEW --> APPROVED_ACTIVE
    APPROVED_ACTIVE --> EXPIRING
    APPROVED_ACTIVE --> ARCHIVED
    EXPIRING --> APPROVED_ACTIVE: renewed
    EXPIRING --> EXPIRED
    EXPIRING --> ARCHIVED
    EXPIRED --> ARCHIVED
    ARCHIVED --> [*]
```

Status changes are made by staff. Only `APPROVED_ACTIVE` covering the student's program satisfies the checklist's MOA item.

### 3.5 Generated document (Built; `DocumentStatus`)

```mermaid
stateDiagram-v2
    [*] --> PENDING_DRAFT: row created<br/>(e.g. endorsement draft on work plan approval,<br/>monthly report submitted)
    PENDING_DRAFT --> GENERATED: PDF rendered and stored
    PENDING_DRAFT --> FAILED: 1 try + up to 3 retries failed
    FAILED --> GENERATED: Regenerate
    GENERATED --> GENERATED: Regenerate (overwrites same file)
```

### 3.6 Data request (Built)

```mermaid
stateDiagram-v2
    [*] --> OPEN: user clicks Request my data<br/>(due in 15 days; one open per user)
    OPEN --> OPEN: daily reminders from 3 days before due
    OPEN --> FULFILLED: Super Admin exports and marks fulfilled
    FULFILLED --> [*]
```

### 3.7 Retention flag (Built)

```mermaid
stateDiagram-v2
    [*] --> PENDING: quarterly scan finds file<br/>3+ years after semester end
    PENDING --> KEPT: Super Admin Keep
    PENDING --> DELETED: Super Admin Delete (password)
    KEPT --> [*]
    DELETED --> [*]
```

### 3.8 Semester (Built)

```mermaid
stateDiagram-v2
    [*] --> Inactive: created
    Inactive --> Active: Activate (others deactivated)
    Active --> Inactive: another semester activated
    Inactive --> Archived: Archive
    Active --> Archived: Archive
    Archived --> [*]: cannot be re-activated
```

### 3.9 User account and lockout (Built)

```mermaid
stateDiagram-v2
    [*] --> MustResetPassword: account created
    MustResetPassword --> Active: sets own password
    Active --> Locked: 5 failed sign-ins<br/>(sessions ended)
    Locked --> Active: 15 minutes pass<br/>or Super Admin Unlock
    Active --> Inactive: deactivated (sessions ended)
    Inactive --> Active: activated
    Active --> Active: forced logout / password reset<br/>(sessions ended)
```

### 3.10 Time request (In progress, L1)

```mermaid
stateDiagram-v2
    [*] --> Pending: student files leave / OT / UT with reason
    Pending --> Approved: adviser approves
    Pending --> Returned: adviser returns with note
    Returned --> Pending: student edits and resubmits
    Approved --> [*]: affects credited hours<br/>(OT ≥ 30 min, capped)
```

Stored as the existing `ValidationStatus` (`PENDING`, `VALIDATED`, `REJECTED`) shown as Pending / Approved / Returned.

### 3.11 Conduct record (Planned, L2)

```mermaid
stateDiagram-v2
    [*] --> Active: staff issues warning / demerit /<br/>violation / suspension (reason, weight)
    Active --> Revoked: revoked with reason (never deleted)
    Revoked --> [*]
    state "Automatic item (late WWR, unsupported UT)" as Auto
    [*] --> Auto
    Auto --> Excused: staff excuses (HTE-attested or<br/>beyond intern's control)
    Excused --> Auto: excuse withdrawn
```

## 4. Key sequences

### 4.1 Weekly report: submit → review → hours → PDF (Built)

```mermaid
sequenceDiagram
    actor S as Student
    actor F as Faculty adviser
    participant API as API routes
    participant WR as weeklyReportService
    participant AT as attendanceService
    participant DOC as documentService
    participant DB as Postgres
    participant ST as Storage
    S->>API: POST /api/weekly-reports/{id}/submit (reasonForDelay?)
    API->>WR: validateLateSubmissionReason (Tuesday 23:59 Manila)
    API->>WR: generateReportReferenceCode (WR-…)
    WR->>DB: status PENDING + SUBMITTED entry (late flag); audit
    API-->>S: in-app notice to student and assigned faculty
    F->>API: PATCH /api/weekly-reports/{id}/review {action, notes}
    API->>API: requireRole FACULTY_ADVISER + assertCanAccessStudent
    API->>WR: Approve / Return / Regard / Disregard
    WR->>AT: recompute confirmed hours and projection (Approve/Regard)
    AT->>DB: student_profiles.rendered_hours
    API-->>S: notification (+ email if configured)
    S->>API: GET or POST /api/weekly-reports/{id}/pdf
    API->>DOC: renderAndStoreDocument (retry 1s/2s/4s)
    DOC->>ST: upload generated-documents/weekly/…
    DOC->>DB: generated_documents GENERATED or FAILED
    API-->>S: redirect to 5-minute signed URL
```

### 4.2 Endorsement letter: gate and re-authentication (Built)

```mermaid
sequenceDiagram
    actor F as Faculty / Coordinator
    participant API as API routes
    participant AUTH as confirmPassword
    participant CK as checklistService
    participant DOC as documentService
    participant N as notify
    F->>API: POST /api/class-groups/{id}/endorsement-letters {password}
    API->>API: requireRole; faculty must advise this class group
    API->>AUTH: verifyCredentials (failures count toward lockout)
    AUTH-->>API: ok / 401 / 423 locked
    loop each student (max 40)
        API->>CK: isEndorsementGateSatisfied (9/9 Approved)
        alt gate satisfied and legal name + company present
            API->>DOC: generateEndorsementLetterPdf (EL-…)
            DOC-->>API: GENERATED
            API->>N: ENDORSEMENT_LETTER_READY to student
        else not eligible
            API-->>F: listed as skipped with reason
        end
    end
```

A single-student letter (`POST /api/students/{id}/endorsement-letter`) runs the same gate without the password step.

### 4.3 Daily job (Built)

```mermaid
sequenceDiagram
    participant CRON as Vercel Cron (00:00 UTC = 08:00 Manila)
    participant API as /api/cron/daily
    participant SN as scheduledNotifications
    participant DB as Postgres
    participant N as notify
    CRON->>API: GET with Authorization: Bearer CRON_SECRET
    API->>API: constant-time secret check (401 if wrong)
    API->>SN: runDailyNotifications(now)
    SN->>DB: open or not-started weekly reports
    SN->>N: DEADLINE_REMINDER per window (48 h / 24 h), deduplicated
    SN->>DB: MOAs expiring within warning days
    SN->>N: MOA_EXPIRING to coordinators and Super Admins
    SN->>DB: OPEN data requests due within 3 days
    SN->>N: DSAR_DUE to Super Admins (once per request per day)
    SN->>SN: runRetentionScan (only if 90 days since last)
    SN-->>API: counts + errors
    API-->>CRON: 200, or 500 if any step failed
```

### 4.4 Export Center export (Built)

```mermaid
sequenceDiagram
    actor A as Super Admin
    participant UI as Export card (inline password form)
    participant API as POST /api/admin/exports/{kind}
    participant AUTH as confirmPassword
    participant EX as adminExportService
    participant AU as auditService
    A->>UI: choose export and semester, enter password
    UI->>API: {password, semesterId?}
    API->>API: requireRole SUPER_ADMIN; valid kind
    API->>AUTH: verifyCredentials
    alt wrong password or locked
        AUTH-->>UI: 401 / 423, message shown inline
    else ok
        API->>EX: buildAdminExport(kind) (no secrets, formula-safe)
        API->>AU: logEvent DATA_EXPORTED (append-only)
        API-->>UI: .xlsx download
    end
```

## 5. Where flows may change

These points rest on the PM's interpretation of SLU's instructions and are open to the adviser's revision ([11](11-decisions-and-open-questions.md)):

| Point                           | Current behaviour                              | Could change if…                                                                   | Question |
| ------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Status-only checklist (D7)      | Files in Google Classroom; IDSMS tracks status | The adviser wants documents in IDSMS                                               | Q1       |
| Endorsement gate                | All 9 items must be Approved                   | Required/optional items are chosen                                                 | Q2       |
| Endorsement before MOA approval | Not possible                                   | A per-student override is added                                                    | Q4       |
| Who finalises hours             | Assigned faculty adviser only                  | A second confirmation is required                                                  | Q3       |
| Hours rules (L1)                | Student-entered hours in approved weeks        | SLU credited-hours rules ship (shift window, OT ≥ 30 min, no offsetting, no grace) | Q6       |
| Week numbering                  | No week numbers yet                            | "Week 1 starts" date per semester                                                  | Q8       |
| Deviation proof                 | Optional upload                                | Moves to Google Classroom with status only                                         | Q19      |
| Monthly report                  | Built from approved weeks                      | SLU monthly journal template                                                       | Q7       |
| Deductions                      | None                                           | SLU matrix (L2)                                                                    | Q9–Q12   |
| Class groups and staff accounts | No screens (database / API)                    | Screens for faculty or Super Admin                                                 | Q20      |
| Email                           | In-app only without a domain                   | Sending domain provided                                                            | Q15      |
| Hosting                         | Vercel + Supabase                              | Lab computer                                                                       | Q17      |
