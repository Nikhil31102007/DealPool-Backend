-- The real link recording custody: who handed what to whom, and the
-- state of that handover. Created when an offer is accepted — deals.status
-- alone can't answer "who has this resource right now."

CREATE TABLE public.transactions (
    id uuid NOT NULL DEFAULT gen_random_uuid (),
    deal_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    from_user_id uuid NOT NULL,   -- provider — who is giving the resource/skill
    to_user_id uuid NOT NULL,     -- requester — who is receiving it
    resource_id uuid NULL,        -- set if this transaction is about a physical resource
    skill_id uuid NULL,           -- set if this transaction is about a skill
    status text NOT NULL DEFAULT 'agreement_created',
    checked_out_at timestamp with time zone NULL,
    returned_at timestamp with time zone NULL,
    completed_at timestamp with time zone NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT transactions_pkey PRIMARY KEY (id),
    CONSTRAINT transactions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals (id) ON DELETE CASCADE,
    CONSTRAINT transactions_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers (id) ON DELETE CASCADE,
    CONSTRAINT transactions_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT transactions_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT transactions_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources (id) ON DELETE SET NULL,
    CONSTRAINT transactions_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills (id) ON DELETE SET NULL,
    CONSTRAINT transactions_status_check CHECK (
        status = ANY (ARRAY[
            'agreement_created'::text,
            'confirmed'::text,
            'active'::text,
            'completed'::text,
            'disputed'::text,
            'cancelled'::text
        ])
    )
) TABLESPACE pg_default;

CREATE INDEX transactions_deal_idx ON public.transactions (deal_id);
CREATE INDEX transactions_offer_idx ON public.transactions (offer_id);
CREATE INDEX transactions_from_user_idx ON public.transactions (from_user_id);
CREATE INDEX transactions_to_user_idx ON public.transactions (to_user_id);
CREATE INDEX transactions_resource_idx ON public.transactions (resource_id);
CREATE INDEX transactions_status_idx ON public.transactions (status);