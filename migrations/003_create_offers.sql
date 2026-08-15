CREATE TABLE IF NOT EXISTS public.offers (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    deal_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    price numeric NULL,
    terms text NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT offers_pkey PRIMARY KEY (id),
    CONSTRAINT offers_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals (id) ON DELETE CASCADE,
    CONSTRAINT offers_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT offers_status_check CHECK (
        status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text])
    )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS offers_deal_idx ON public.offers (deal_id);
CREATE INDEX IF NOT EXISTS offers_provider_idx ON public.offers (provider_id);