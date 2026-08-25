# IDSMS-CIS: Internship Document Submission and Monitoring System for CIS

**IDSMS-CIS** is a centralized web platform for Saint Louis University's SAMCIS department that digitizes the CHED-mandated student internship lifecycle. It enforces strict pre-deployment compliance, automates hour tracking, and features AI-assisted faculty reviews and a unified calendar for intuitive timeline management.

---

## 🚀 Key Features

- **Compliance Gating**: Blocks active deployment until all 9 pre-deployment documents are approved.
- **Automated Tracking**: Real-time hour computation, deviation report validation, and projected completion dates.
- **Unified Calendar**: Role-specific views for deadlines, holidays, and OJT milestones.
- **AI-Assisted Reviews**: Server-side text similarity detection (Gemini `text-embedding-004` + pgvector) and sentiment analysis to support faculty judgment.
- **Document Generation**: Server-side Puppeteer rendering for traceable PDFs (Endorsement Letters, Weekly/Monthly Reports).
- **Role-Based Dashboards**: Tailored views for Student Interns, Faculty Advisers, Department Coordinators, and Super Admins.
- **Data Privacy**: Fully compliant with RA 10173, featuring append-only audit logs and scoped, time-limited file access.

---

## 🛠️ Tech Stack

| Layer              | Technology                                                   |
| :----------------- | :----------------------------------------------------------- |
| **Framework**      | Next.js 14 (App Router)                                      |
| **Language**       | TypeScript                                                   |
| **Styling**        | Tailwind CSS                                                 |
| **Database**       | PostgreSQL 15 via Supabase (with `pgvector` extension)       |
| **ORM**            | Prisma                                                       |
| **Authentication** | NextAuth.js v4.24.x                                          |
| **AI Services**    | Google Gemini API (`text-embedding-004`, `gemini-2.5-flash`) |
| **Document Gen**   | Puppeteer (`@sparticuz/chromium`)                            |
| **Email**          | Resend + React Email                                         |
| **Deployment**     | Vercel + GitHub Actions                                      |

---

## 📦 Getting Started

Team member? See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the fastest path — GitHub Codespaces needs zero local setup. Below is the local-dev path.

### Prerequisites

- Node.js 24+ (required — `@sparticuz/chromium` and `lint-staged` don't support Node 20)
- npm
- A Supabase project with the `vector` extension enabled (not yet provisioned — see PRD Phase 0)
- Google Gemini API Key
- Resend API Key

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

   # THEN run these by hand in the Supabase SQL editor, in order — both ALTER
   # tables that db push is what creates, so they must run AFTER it:
   #   prisma/migrations_manual/001_vector_extension_and_audit_rls.sql
   #     enables pgvector and locks down audit_logs (append-only)
   #   prisma/migrations_manual/002_default_deny_rls.sql
   #     enables RLS (no policies) on every other table
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```text
/src
  /app                    # Next.js App Router pages, layouts, and API routes
  /components             # Reusable UI components (shadcn/ui, custom)
  /lib
    /services             # Core business logic (report, checklist, ai, etc.)
    /utils                # Helper functions and formatters
    /validators           # Zod schemas for input validation
  /types                  # TypeScript type definitions
  middleware.ts           # NextAuth.js RBAC and route protection
```

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

- **Data Privacy**: This system adheres to the Philippine Data Privacy Act of 2012 (RA 10173). Personal and health-related documents are encrypted at rest and accessible only on a strict need-to-know basis.
- **AI Ethics**: All AI-generated similarity and sentiment flags are strictly **advisory**. They do not automate grading, approval, or rejection decisions, preserving faculty authority and student fairness.

---

## 📄 License

This project is developed for academic purposes under Saint Louis University. All rights reserved.
