-- Manual migration — run once against the real Supabase project (SQL editor,
-- or via the Supabase MCP's apply_migration). Not Prisma-managed at all —
-- Storage buckets aren't Postgres tables Prisma owns — but numbered and
-- ordered after 001/002 to keep the team's "run these by hand, in order"
-- habit consistent. Independent of any `db push` (no table dependency), but
-- Phase 2's app code (src/lib/storage.ts) assumes both buckets exist.
--
-- Two buckets, not one-per-document-type: granular enough to give each a
-- distinct size/MIME policy, coarse enough to avoid maintaining 9+ buckets
-- for a capstone team. checklist-documents covers the 7 file-upload
-- checklist items (object path: {studentProfileId}/{requirementType}.{ext});
-- moa-documents covers MOA PDF uploads (object path:
-- {companyId}/{moaRecordId}.{ext}). Both public:false.
--
-- file_size_limit here is a hard backstop in bytes (5MB, the larger of the
-- two app-level caps) — the real per-type split (5MB PDF / 2MB image) is
-- enforced by src/lib/storage.ts's validateUpload() before a file ever
-- reaches Storage. allowed_mime_types is a second backstop matching that
-- same allow-list.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('checklist-documents', 'checklist-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png']),
  ('moa-documents', 'moa-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by default with zero policies
-- (default-deny) — same as every table 002_default_deny_rls.sql covers.
-- That is NOT what makes these buckets safe: this app's Storage client
-- (src/lib/storage.ts) authenticates with the service-role key, which
-- bypasses RLS entirely, exactly like Prisma's own Postgres connection does.
-- What actually makes these buckets safe is (a) public:false above, and
-- (b) this app never exposing any Supabase key to the browser — no
-- NEXT_PUBLIC_SUPABASE_* variable exists, or should ever exist, for this
-- project. This file exists purely to make bucket provisioning reproducible
-- and team-shareable rather than a one-off dashboard click.
