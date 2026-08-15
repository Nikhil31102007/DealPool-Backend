-- Physical items a user owns and is willing to lend/exchange.
-- Distinct from `deals` — a Resource is listed proactively,
-- not created in response to a specific request.

CREATE TABLE public.resources (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    owner_id uuid NOT NULL,
    title text NOT NULL,
    description text NULL,
    category text NULL,
    condition text NULL,
    location geography(Point, 4326) NOT NULL,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT resources_pkey PRIMARY KEY (id),
    CONSTRAINT resources_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles (id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX resources_location_gix ON public.resources USING GIST (location);
CREATE INDEX resources_owner_idx ON public.resources (owner_id);
CREATE INDEX resources_available_idx ON public.resources (is_available);