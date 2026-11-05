-- Duplicate company matching in the database (FR-MOA-02), instead of loading every company
-- into memory per keystroke. Trigram similarity (pg_trgm) also catches typos ("Acenture")
-- that the old containment check missed.
-- 1. company_name_key(name): the same normalization as normalizeCompanyName() in
--    companyService.ts (lower-case, punctuation to spaces, legal-form and country words
--    dropped). Keep the two word lists in step.
-- 2. A GIN trigram index on that key for live companies.
-- After 001-025. Additive and idempotent. The extension lives in its own schema (Supabase's
-- advice), created here so a plain Postgres server runs this too.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.company_name_key(name text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(w, ' ' order by ord), '')
  from regexp_split_to_table(
         pg_catalog.regexp_replace(pg_catalog.lower(name), '[^a-z0-9]+', ' ', 'g'), ' '
       ) with ordinality as t(w, ord)
  where w <> ''
    and w not in ('the', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd',
                  'limited', 'llc', 'opc', 'ph', 'phil', 'phils', 'philippines');
$$;

create index if not exists companies_name_key_trgm
  on public.companies using gin (public.company_name_key(name) extensions.gin_trgm_ops)
  where deleted_at is null;
