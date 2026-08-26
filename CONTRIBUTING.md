# Contributing to IDSMS-CIS

Team Beacon capstone (IT 321). This doc covers how to get set up and how we work — not the product spec, which lives in [`PRD.md`](./PRD.md).

## Getting added

Ask a Department Coordinator-role teammate (or whoever holds org admin) to add you to the `team-beacon-slu` GitHub organization and the `idsms-cis` repo. You'll need a GitHub account.

## Fastest path: GitHub Codespaces

No local Node/npm setup needed.

1. On the repo page, click **Code → Codespaces → Create codespace on develop**.
2. Wait for the container to build — it runs `npm install` (and `prisma generate` once `DATABASE_URL` exists) automatically.
3. Run `npm run dev` in the Codespace terminal, then use the forwarded port-3000 preview.

## Local dev fallback

If you'd rather work locally:

```bash
git clone https://github.com/team-beacon-slu/idsms-cis.git
cd idsms-cis
npm install
cp .env.example .env.local   # fill in real values once we have Supabase/Gemini/Resend keys
npm run dev
```

Requires Node 24+ (the devcontainer, CI, and `package.json#engines` all pin this — `@sparticuz/chromium` and `lint-staged` require it).

## Branching & PRs

- Feature branches off `develop`, named `feature/<short-description>` or `fix/<short-description>`.
- Open a PR into `develop`. `main` only receives merges from `develop` at milestone checkpoints.
- PR review is required before merge — branch protection enforces this on both `main` and `develop`.
- CI (lint, typecheck, `prisma validate`, build) must pass before merge.

## Code organization

All business logic lives in `/src/lib/services/` — never directly in page files or API route handlers (NFR-MNT-06). See the service stubs already in place; each one maps to a PRD module.

## Database changes

We're on Prisma with a Supabase Postgres backend. Edit `prisma/schema.prisma`, then run `npx prisma db push` — **not** `prisma migrate dev`. This project has no migration history (schema changes have always gone through `db push`), so `migrate dev` sees the entire existing schema as "drift" and wants to reset the database to establish a baseline, which would drop all data on our shared dev project. Confirmed this the hard way during Phase 1; stick with `db push`.

Anything Prisma can't express at all (a Postgres extension, an RLS policy, a Storage bucket) goes in a hand-written SQL file under `prisma/migrations_manual/`, run once by hand in the Supabase SQL editor **after** the `db push` that creates the tables it touches (numbered in the order they need to run — `001_...` before `002_...`, etc.). See `001_vector_extension_and_audit_rls.sql`, `002_default_deny_rls.sql`, and `003_storage_buckets.sql` for the pattern. Ordinary schema changes (new columns, new tables) don't need a file here — `db push` alone handles those.

## Questions

Ping the team channel, or ask the Project Adviser (Ria Andrea N. Fernandez) at the next milestone checkpoint.
