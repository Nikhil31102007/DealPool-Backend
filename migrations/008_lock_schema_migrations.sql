-- WHY THIS MIGRATION EXISTS:
--
-- Supabase auto-generates a public REST API (PostgREST) over every table
-- in the public schema. schema_migrations isn't user data, but there's
-- no reason it should be readable via the anon-key API either — it'd let
-- anyone fingerprint exactly what schema version this app is on.
--
-- RLS enabled with no policies = zero access via anon/authenticated
-- roles. Our backend connects as the Supabase pooler superuser
-- (BYPASSRLS), so this has no effect on the app itself.

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;