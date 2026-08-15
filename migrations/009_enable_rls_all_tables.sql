-- Enabled last, deliberately — every table this touches must already
-- exist. RLS with no policies = zero access via Supabase's PostgREST
-- API (anon/authenticated roles); our backend connects as the Supabase
-- pooler superuser (BYPASSRLS) so this has no effect on the app itself.
--
-- This is the actual fix for a real exposure: without it, anyone with
-- our project's anon key could query real user/deal/offer/resource/
-- skill/transaction rows directly via Supabase's REST API, completely
-- bypassing our Express backend's auth checks.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- No CREATE POLICY statements added intentionally — deny all by default
-- until a specific feature gives a real reason to open a table to the
-- public API.
