# IDSMS-CIS: Internship Document Submission and Monitoring System for CIS

**IDSMS-CIS** is a centralized web platform for Saint Louis University's SAMCIS department that digitizes the CHED-mandated student internship lifecycle. It enforces strict pre-deployment compliance, automates hour tracking, and features AI-assisted faculty reviews and a unified calendar for intuitive timeline management.

---

## 🚀 Key Features

- **Compliance Gating**: Blocks the endorsement letter until every required pre-deployment item is approved (tracked by status; the files stay in Google Classroom).
- **Automated Tracking**: Real-time hour computation, deviation report validation, and projected completion dates.
- **Unified Calendar**: Role-specific views for deadlines, holidays, and OJT milestones.
- **AI-Assisted Reviews**: Optional similarity and sentiment hints for faculty (Gemini embeddings + pgvector), advisory only and switched off until approved.
- **Document Generation**: Server-side Puppeteer rendering for traceable PDFs (Endorsement Letters, Weekly/Monthly Reports).
- **Role-Based Dashboards**: Tailored views for Student Interns, Faculty Advisers, Department Coordinators, and Super Admins.
- **Data Privacy**: Built for RA 10173: privacy notice and terms agreement, append-only audit log, "Request my data", file retention review, and scoped, time-limited file access.

---

## 🛠️ Tech Stack

| Layer              | Technology                                                 |
| :----------------- | :--------------------------------------------------------- |
| **Framework**      | Next.js 16 (App Router)                                    |
| **Language**       | TypeScript                                                 |
| **Styling**        | Tailwind CSS 4, shadcn/ui, light and dark themes           |
| **Database**       | PostgreSQL 15 via Supabase (with `pgvector` extension)     |
| **ORM**            | Prisma 7                                                   |
| **Authentication** | NextAuth.js v4.24.x                                        |
| **AI Services**    | Google Gemini API (models set by env vars; off by default) |
| **Document Gen**   | Puppeteer (`@sparticuz/chromium`)                          |
| **Email**          | Resend + React Email                                       |
| **Deployment**     | Vercel + Supabase today; SAMCIS lab computer in Phase 5    |

---

## 📦 Getting Started

Team member? See [`CONTRIBUTING.md`](.github/CONTRIBUTING.md) for the fastest path — GitHub Codespaces needs zero local setup. Below is the local-dev path.

### Just run it (Windows)

Double-click **`scripts/start-idsms.cmd`**. It installs what is missing on the first run, rebuilds only when the code has changed, starts the site and opens http://localhost:3000 in your browser. Close its window to stop the site. For a desktop icon: right-click the file → **Send to** → **Desktop (create shortcut)**. It needs Node.js 24+ and a filled-in `.env` (see below).

### Prerequisites

- Node.js 24+ (required — `@sparticuz/chromium` and `lint-staged` don't support Node 20)
- npm
- A Supabase project with the `vector` extension enabled
- Google Gemini API key (optional; only for the AI hints)
- Resend API key (optional; only for email)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/team-beacon-slu/idsms-cis.git
   cd idsms-cis
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Then fill in real values in `.env.local` (gitignored — never commit real secrets).

4. **Initialize the database** _(once a real Supabase project exists — see `prisma/migrations_manual/`)_

   ```bash
   npx prisma generate
   npx prisma db push

   # THEN run EVERY file in prisma/migrations_manual/ by hand in the Supabase
   # SQL editor, in number order (001, 002, … up to the highest), AFTER db push.
   # Each touches something Prisma can't express (pgvector, RLS, Storage
   # buckets, indexes, constraints) and many ALTER tables db push creates.
   ```

   Also requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` as of Phase 2 (file uploads for MOA records and deviation proofs go through Supabase Storage) — see `.env.example`.

5. **Run the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

The root holds only this README, the folders below, and the config files each tool must find at the top level (`package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `eslint.config.mjs`, `jest.config.ts`, `components.json` for shadcn/ui, `vercel.json`). `AGENTS.md` is written by `next dev`.

```text
/.config                  # Prisma CLI config (prisma.ts)
/.github                  # CI workflow and CONTRIBUTING.md
/.husky, /.devcontainer   # Git hooks; Codespaces setup
/cypress                  # End-to-end tests and their config (Phase 5)
/deploy                   # Self-hosting stack for the lab computer: Docker, compose, runbook
/docs                     # All documentation, including the PRD; start at docs/README.md
/prisma                   # schema.prisma, migrations_manual/, seed scripts
/scripts                  # One-off scripts (AI golden-set evaluation)
/src
  /app                    # Next.js App Router: (auth), (legal), (dashboard) pages and /api routes
    /(dashboard)/_components  # The signed-in shell: menu, account menu, bell, role dashboards
  /components             # UI shared across route groups (shadcn/ui primitives in /ui)
  /lib
    /services             # Business logic, one folder per domain: accounts, academic,
                          # predeployment, attendance, reports, conduct, calendar,
                          # notifications, dashboards, privacy, ai
    /utils                # Helper functions and formatters
    /validators           # Zod schemas for input validation
  /types                  # TypeScript type definitions
  /testUtils              # Shared Jest helpers (Prisma mock, Jest setup)
  proxy.ts                # Route protection and the CSP nonce (Next 16's middleware)
```

---

## 📚 Documentation

Everything is catalogued in [`docs/README.md`](docs/README.md): how the system works ([`docs/system/`](docs/system/README.md)), the open [questions for our adviser](docs/ADVISER_QUESTIONS.md), active plans and the archive of finished ones.

---

## 👥 Team & Adviser

**Team Beacon (IT 321)**

- Abanador, Frencine Daine L.
- Andres, James Matthew S.
- Antonio, Shantea Myles C.
- Aragon, Danielle John P.
- Avaricio, Kenneth Russel C.
- Domenden, Gillian D.
- Gayaso, Ulrich L.
- Suarez, Steven Dale O.

**Project Adviser**: Ria Andrea N. Fernandez  
**Institution**: Saint Louis University — SAMCIS

---

## ⚖️ Compliance & Ethics

- **Data Privacy**: This system adheres to the Philippine Data Privacy Act of 2012 (RA 10173). Health records and signed documents are not stored in IDSMS (they stay in Google Classroom); the files it does keep are private, encrypted at rest by the storage provider, and opened only through short-lived, access-checked links.
- **AI Ethics**: All AI-generated similarity and sentiment flags are strictly **advisory**. They do not automate grading, approval, or rejection decisions, preserving faculty authority and student fairness.

---

## 📄 License

This project is developed for academic purposes under Saint Louis University. All rights reserved.
