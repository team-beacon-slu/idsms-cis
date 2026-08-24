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

| Layer | Technology |
| :--- | :--- |
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS |
| **Database** | PostgreSQL 15 via Supabase (with `pgvector` extension) |
| **ORM** | Prisma |
| **Authentication** | NextAuth.js v4.24.x |
| **AI Services** | Google Gemini API (`text-embedding-004`, `gemini-2.5-flash`) |
| **Document Gen** | Puppeteer (`@sparticuz/chromium`) |
| **Email** | Resend + React Email |
| **Deployment** | Vercel + GitHub Actions |

---

## 📦 Getting Started

### Prerequisites
- Node.js 18+ 
- npm, yarn, or pnpm
- A Supabase project with the `vector` extension enabled
- Google Gemini API Key
- Resend API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/idsms-cis.git
   cd idsms-cis
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory and add the following:
   ```env
   DATABASE_URL="your_supabase_postgres_connection_string"
   DIRECT_URL="your_supabase_direct_connection_string"
   NEXTAUTH_SECRET="your_generated_secret"
   NEXTAUTH_URL="http://localhost:3000"
   GEMINI_API_KEY="your_gemini_api_key"
   RESEND_API_KEY="your_resend_api_key"
   ```

4. **Initialize the database**
   ```bash
   # Enable pgvector extension in Supabase SQL editor first:
   # CREATE EXTENSION IF NOT EXISTS vector;
   
   npx prisma generate
   npx prisma db push
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

