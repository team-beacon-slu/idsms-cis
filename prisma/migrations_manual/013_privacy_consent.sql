-- FR-CK-05 / NFR-DP-03 (RA 10173): record when each user agreed to the data
-- privacy notice and which version. Additive, nullable. Apply after 012.
alter table users add column if not exists privacy_consent_at timestamptz;
alter table users add column if not exists privacy_consent_version text;
