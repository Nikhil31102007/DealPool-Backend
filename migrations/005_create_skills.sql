-- A skill/service a user is willing to offer. No location column —
-- skills can be remote; add one later if in-person-only skills need
-- geo filtering.

CREATE TABLE public.skills (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text NULL,
    category text NULL,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT skills_pkey PRIMARY KEY (id),
    CONSTRAINT skills_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX skills_user_idx ON public.skills (user_id);
CREATE INDEX skills_name_idx ON public.skills (name);