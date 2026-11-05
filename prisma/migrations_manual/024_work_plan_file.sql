-- The adviser: each company has its own work plan template, so the intern uploads it.
-- The PDF's storage path on the work plan (checklist-documents bucket). After 001-023.
-- Additive and idempotent.

alter table work_plans add column if not exists file_path text;
