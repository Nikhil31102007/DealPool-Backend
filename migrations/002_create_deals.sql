CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.deals (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text NULL,
    category text NULL,
    budget_min numeric NULL,
    budget_max numeric NULL,
    location geography(Point, 4326) NOT NULL,
    radius_km numeric NOT NULL DEFAULT 10,
    status text NOT NULL DEFAULT 'open'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT deals_pkey PRIMARY KEY (id),
    CONSTRAINT deals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT deals_status_check CHECK (
        status = ANY (ARRAY['open'::text, 'offer_accepted'::text, 'completed'::text, 'cancelled'::text])
    )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS deals_location_gix ON public.deals USING GIST (location);
CREATE INDEX IF NOT EXISTS deals_status_idx ON public.deals (status);
CREATE INDEX IF NOT EXISTS deals_user_idx ON public.deals (user_id);