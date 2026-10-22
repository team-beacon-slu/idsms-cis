# 15. Design brief

> Draft for adviser review — flows and rules may change; see [README](README.md).

_Last updated: 13 October 2026. Audience: designers, front-end maintainers, the adviser. Items labelled **Recommendation (not built)** are suggestions, not current behaviour._

This brief describes the IDSMS-CIS user interface as built (Next.js 14, Tailwind CSS, shadcn/ui components, the navy/slate "enterprise dashboard" redesign from PR #48) and the rules new screens should follow. Sources: `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/components/**`, `src/app/(dashboard)/**`, `src/lib/documents/**`.

## 1. Purpose and audiences

IDSMS is an institutional work tool for SAMCIS, Saint Louis University. People use it to finish a task correctly and get back to work, not to browse.

| Audience         | Typical device and context                                                    | What the UI must do for them                                                                    |
| ---------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Student interns  | Phone or laptop, often at the host company, weekly, near the Tuesday deadline | Make the next action obvious; prevent mistakes before submitting; show hours and status plainly |
| Faculty advisers | Laptop, in batches (reviewing many reports)                                   | Scan who needs attention; review quickly; never lose a decision                                 |
| Coordinator      | Desktop                                                                       | Department overview, filters, exports                                                           |
| Super Admin      | Desktop                                                                       | Safe handling of sensitive actions (password re-check, clear consequences)                      |

## 2. Brand and tone

- **Institutional and trustworthy:** SLU SAMCIS context; calm navy and slate colours; no decorative imagery; no emoji in the UI.
- **Plain, specific language:** say what happened and what to do next ("A note is required when returning an item").
- **Honest status:** never suggest something is done when it is pending (for example "+8 hrs pending review" next to confirmed hours).
- The UI currently shows the name "IDSMS-CIS" as text; there is no SLU logo yet. The PDF letterhead is a text letterhead until SLU's official letterhead is supplied.

## 3. Design principles

1. **Status first.** Every record shows its state as a text badge; the next action is next to it.
2. **Rules visible at the point of action.** Deadlines, locks and gates are explained where the user hits them (for example "The work schedule can be set once the work plan is approved").
3. **Inline over modal.** Confirmations and password re-checks appear inline in the card or row (Export Center), not in pop-up dialogs, keeping context and focus. The bulk endorsement password prompt is the one dialog today.
4. **Never colour alone.** Colour supports the text label; it never replaces it.
5. **Server is the source of truth.** The UI never computes official hours or deadlines on its own; it shows what the server returns, in Manila time.
6. **Calm density.** Data-dense tables for staff, generous spacing and one primary action for students.

## 4. Colour tokens (as built)

Defined as HSL CSS variables in `globals.css`, mapped to Tailwind colours in `tailwind.config.ts`. Hex values are the nearest Tailwind palette equivalents.

| Token                                  | HSL (light)                     | Hex                                                   | Usage                                         |
| -------------------------------------- | ------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `--background`                         | `0 0% 100%`                     | `#FFFFFF`                                             | Page background                               |
| `--foreground`                         | `222 47% 11%`                   | `#0F172A`                                             | Body text (slate-900)                         |
| `--card`                               | `0 0% 100%`                     | `#FFFFFF`                                             | Cards                                         |
| `--primary`                            | `221 83% 53%`                   | `#2563EB`                                             | Primary buttons, links, focus ring (blue-600) |
| `--secondary` / `--muted` / `--accent` | `210 40% 96%`                   | `#F1F5F9`                                             | Secondary surfaces (slate-100)                |
| `--muted-foreground`                   | `215 16% 47%`                   | `#64748B`                                             | Secondary text (slate-500)                    |
| `--border` / `--input`                 | `214 32% 91%`                   | `#E2E8F0`                                             | Borders and inputs (slate-200)                |
| `--destructive`                        | `0 84% 60%`                     | `#EF4444`                                             | Destructive actions, errors                   |
| `--ring`                               | `221 83% 53%`                   | `#2563EB`                                             | Focus ring                                    |
| `--sidebar`                            | `222 47% 11%`                   | `#0F172A`                                             | Fixed dark-navy sidebar                       |
| `--sidebar-accent`                     | `217 33% 17%`                   | `#1E293B`                                             | Sidebar hover                                 |
| `--sidebar-primary`                    | `221 83% 53%`                   | `#2563EB`                                             | Active nav item                               |
| `--sidebar-border`                     | `215 19% 35%`                   | `#475569`                                             | Sidebar dividers                              |
| `--chart-1…5`                          | blue, green, amber, red, violet | `#2563EB`, `#22C55E`, `#F59E0B`, `#EF4444`, `#7C3AED` | Charts (reserved)                             |
| Radius `--radius`                      | `0.5rem`                        | —                                                     | Cards, buttons (md/sm derived)                |

**Status tones** (`src/components/status-badge.tsx`, also used by StatCard icons), each a light tint, darker text, border and a dot:

| Tone  | Classes                           | Statuses                                                                                |
| ----- | --------------------------------- | --------------------------------------------------------------------------------------- |
| Green | green-50 / green-700 / green-200  | Approved, Approved Active, Validated, Generated, Sent, Regarded, Completed              |
| Amber | amber-50 / amber-700 / amber-200  | Pending, Pending Draft, Drafting, Submitted, For HTE/University Review, Expiring, Draft |
| Red   | red-50 / red-700 / red-200        | Returned, Rejected, Expired, Failed, Disregarded, Needs Attention                       |
| Blue  | blue-50 / blue-700 / blue-200     | On Track, Archived, Locked, Linked                                                      |
| Slate | slate-100 / slate-700 / slate-200 | Anything else                                                                           |

A `.dark` token set exists in `globals.css`, but there is no theme switch, so the app runs in light mode (the sidebar is always dark navy). The PDF letterhead uses navy `#1E3A5F`.

Note: `design-system/idsms-cis/MASTER.md` (generated 27 August 2026) proposed a dark theme with Fira fonts. The redesign that was actually built (PR #48) uses the light palette above and Geist. This brief documents what is built; the MASTER file should be updated to match (**Recommendation (not built)**).

## 5. Typography

| Use            | As built                                                                              |
| -------------- | ------------------------------------------------------------------------------------- |
| UI font        | Geist Sans (local variable font, `--font-geist-sans`); Geist Mono available for codes |
| Page title     | `text-2xl font-semibold tracking-tight`                                               |
| Card title     | shadcn `CardTitle` (`text-base` for compact cards)                                    |
| Body           | Tailwind default `text-sm` in tables and forms, `text-base` elsewhere                 |
| Secondary text | `text-sm text-muted-foreground`; hints `text-xs`                                      |
| Stat values    | `text-2xl font-semibold`                                                              |
| PDFs           | Arial/Helvetica 11 pt; letterhead 14 pt bold navy                                     |

Formats: dates and times in **Asia/Manila** (`en-PH`), for example "Oct 13, 2026, 8:00 AM"; reference codes in uppercase (`WR-20261005-1A2B3C4D`). Hours appear as decimals today ("7.5"); SLU's "N hrs M mins" format arrives with L1 (**In progress**).

## 6. Layout and spacing

- **Shell** (`(dashboard)/layout.tsx`): fixed 256 px (`w-64`) dark-navy sidebar on desktop (`md` and up); content offset `md:pl-64`; content column `max-w-6xl`, centred, padding `px-4` / `sm:px-6` / `md:px-8`, `py-6`.
- **Mobile:** top bar (56 px) with the app name, bell and a menu button that opens a slide-over drawer (`w-72`) with an overlay; closes on navigation.
- **Spacing scale:** Tailwind 4 px steps; cards use `p-5`/`p-6`, sections `mb-4`/`gap-4`, inline gaps `gap-1.5`–`gap-3`.
- **Grids:** stat cards in responsive grids (one column on phones, up to four on desktop); tables full-width inside cards.
- **Print:** navigation hidden (`print:hidden`), padding removed, so the weekly report preview prints cleanly.

## 7. Component inventory

| Component                                                        | Source                                    | Notes                                                                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Button, Input, Label, Textarea, Card, Table, Badge, Form, Dialog | `src/components/ui/*` (shadcn/ui, Radix)  | Dialog is used only for the bulk endorsement password prompt (the mobile nav is a custom drawer); prefer inline patterns |
| Toaster                                                          | `ui/sonner.tsx` (sonner)                  | Short success/error confirmations after actions                                                                          |
| StatusBadge                                                      | `components/status-badge.tsx`             | Text label + tinted background + dot; humanises enum values ("For Hte Review")                                           |
| StatCard                                                         | `components/stat-card.tsx`                | Label, big value, optional hint, tinted icon (aria-hidden)                                                               |
| EmptyState                                                       | `components/empty-state.tsx`              | Dashed border, icon, title, description, optional action                                                                 |
| ComplianceTable                                                  | `components/compliance-table.tsx`         | Shared staff table: hours bar, pending hours, checklist x/9, due-week state, status                                      |
| AuthShell                                                        | `components/auth-shell.tsx`               | Two-panel sign-in and reset pages                                                                                        |
| PasswordAction                                                   | `admin/export-center/password-action.tsx` | Inline password re-check form with confirm/cancel, focus kept in the form                                                |
| NotificationBell                                                 | `(dashboard)/notification-bell.tsx`       | Unread count, links to `/notifications`                                                                                  |
| Icons                                                            | lucide-react                              | Always with a visible text label or `aria-hidden` when decorative                                                        |

## 8. Interaction patterns

| Pattern           | Rule (as built)                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmation      | Inline confirm in the row or card (for example Delete on a retention flag, Mark fulfilled) instead of a modal                                              |
| Sensitive actions | Inline password field; wrong password shows an inline error; lockout message names the time it lifts                                                       |
| Required notes    | Return actions require a note; without one the server rejects the action and the message explains why. Buttons are disabled while a request is in progress |
| Status            | StatusBadge everywhere, never colour-only                                                                                                                  |
| Empty states      | EmptyState with what is missing and what to do ("No weekly reports yet")                                                                                   |
| Feedback          | Buttons show pending state; toasts confirm success or show the server's error message                                                                      |
| Locks             | Locked features explain the condition ("Unlocks at 500 confirmed hours (212 / 500 so far)")                                                                |
| Downloads         | Files download through the app's own routes (signed links); failed PDFs show Regenerate                                                                    |
| Warnings          | Copy-paste warnings sit next to the affected day, not only at the top                                                                                      |
| Time              | Manila time everywhere; deadlines stated with the time ("Tuesday 11:59 PM")                                                                                |

## 9. Role dashboards

| Role                      | Layout                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Student                   | "Welcome back"; amber **Needs attention** card (only when needed); stat cards (hours with pending hint); pre-deployment requirements; weekly report history; final report cover card; quick links      |
| Faculty                   | Stat cards (total, submitted this week, pending review, not submitted); My students table; Export to Excel and Weekly summary; bulk endorsement per class group                                        |
| Coordinator / Super Admin | Stat cards (users, students, deployed, average hours, needs attention, companies, verified, MOAs expiring); program cards; filters (semester, program, status); all-students compliance table; exports |

## 10. Accessibility

Target: **WCAG 2.1 AA**.

As built:

- Text contrast: foreground `#0F172A` and muted `#64748B` on white meet 4.5:1; badge text uses the 700 shade on a 50 tint.
- Visible focus: shadcn components use the `ring` token (`#2563EB`); focus outlines are not removed.
- Keyboard: all actions are buttons or links; the mobile menu has labelled open/close buttons and `role="dialog"` with `aria-modal`; the inline password form keeps focus inside it.
- Icons are `aria-hidden` when decorative; icon-only buttons have `aria-label`.
- Current page in the nav uses `aria-current="page"`.
- Status is always text, not colour alone.
- Language: `<html lang="en">`.

**Recommendation (not built)**, from the ui-ux-pro-max accessibility and forms guidelines:

- Announce asynchronous changes (toasts, unread count) with a single `role="status"` message that has context ("3 unread notifications"), not a bare number.
- Wrap wide staff tables in a horizontally scrollable region (or card layout on phones) so nothing overflows at 375 px.
- Keep focus visible under the fixed mobile top bar (`scroll-padding-top`), per WCAG 2.2 "Focus not obscured".
- Show form errors next to each field plus a short summary on long forms (weekly report).
- Ensure touch targets of at least 44 × 44 px for the day-status selector and row actions on phones.
- Respect `prefers-reduced-motion` for the drawer and hover transitions.
- Run an automated audit (axe) and a keyboard-only walkthrough as part of Phase 5 UAT.

## 11. Responsive behaviour

- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280 px). The sidebar appears at `md`.
- Students are expected to use phones; their pages are single-column with stacked cards.
- Staff tables are designed for desktop; on phones they need horizontal scrolling (see recommendation above).
- Test widths: 375, 768, 1024, 1440 px.

## 12. PDF and print design

- PDFs are rendered on the server from HTML templates (`src/lib/documents/*`) with Chromium, so they look the same everywhere.
- Common elements: text letterhead (SAMCIS, Saint Louis University, navy rule), reference code and generation time, Manila dates, Arial 11 pt.
- Documents: weekly report, monthly report, endorsement letter, final report cover.
- **In progress (L1):** the weekly report follows SLU's Weekly Work Report template: header with school and department, "Week No. N (date range)", "Name: Last, First M.", Company; a Detailed Time Record table (Date (Day) | Actual Work Times with up to two ranges | Hours Rendered as "N hrs M mins" | Work Accomplishment); holiday rows "Holiday (PH Calendar)"; beginning, week and ending totals; supervisor signature block; optional "Report on Overtime Hours" and "Report on Under Time Hours" sections, each with its own supervisor signature line and SLU's notes.
- **Recommendation (not built):** replace the text letterhead with SLU's official letterhead (logo and seal) once supplied.

## 13. Content and copy guidelines

- Use the SLU terms users know: HTE, MOA, OJT, Weekly Work Report, endorsement letter (see [Glossary](12-glossary.md)).
- Buttons are verbs: "Submit", "Approve", "Return", "Generate", "Request my data".
- Errors say what to do: "Set your full name on the Profile page first".
- Mention Google Classroom wherever a document must go there ("signed documents are never uploaded to IDSMS").
- Use "confirmed" for approved hours and "pending review" for submitted hours.
- Name the person or role that acts next ("awaiting faculty review").
- Dates as "Oct 13, 2026"; times as "8:00 AM"; always Manila time.

## 14. Recommendations from the design review

All items below are **Recommendation (not built)**. They came from the ui-ux-pro-max review (accessibility, forms, data tables) and our own reading of the code. The tool's generic "dashboard" suggestion (dark glassmorphism, Fira fonts) was **not** adopted because it does not suit an institutional, print-oriented, light-mode tool.

| Priority | Recommendation                                                                      |
| -------- | ----------------------------------------------------------------------------------- |
| High     | Announce async status changes with contextual `role="status"` text                  |
| High     | Horizontal-scroll or card layout for staff tables on phones                         |
| High     | Field-level errors plus an error summary on the weekly report form                  |
| Medium   | Show hours as "N hrs M mins" everywhere once L1 ships, for consistency with the PDF |
| Medium   | Add the SLU logo and seal to the sidebar header and PDFs                            |
| Medium   | Update `design-system/idsms-cis/MASTER.md` to the built light palette and Geist     |
| Medium   | A first-login tour (NFR-USA-02) explaining status colours and the main action       |
| Low      | Optional dark theme switch (tokens already exist)                                   |
| Low      | Respect reduced-motion preferences for transitions                                  |
