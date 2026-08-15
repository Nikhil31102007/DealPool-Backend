-- Chain linking — resources only. A skill transaction is a one-off
-- (provider performs it for requester), there's nothing to hand off
-- further, so no parent/chain concept applies to skill_id transactions.
ALTER TABLE public.transactions
    ADD COLUMN parent_transaction_id uuid NULL;

ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_parent_transaction_id_fkey
    FOREIGN KEY (parent_transaction_id) REFERENCES public.transactions (id) ON DELETE SET NULL;

-- Enforce the scoping in the DB, not just convention: a transaction can
-- only have a parent if it's resource-based, and can never have both
-- resource_id and skill_id set at once.
ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_parent_requires_resource_check CHECK (
        parent_transaction_id IS NULL OR resource_id IS NOT NULL
    ),
    ADD CONSTRAINT transactions_resource_xor_skill_check CHECK (
        (resource_id IS NOT NULL AND skill_id IS NULL) OR
        (resource_id IS NULL AND skill_id IS NOT NULL)
    );

CREATE INDEX transactions_parent_idx ON public.transactions (parent_transaction_id);

-- Current holder — resources only. Skills have no "holder" concept,
-- profiles.id already tracks who provides a skill via skills.user_id,
-- there's no separate custody state to track.
ALTER TABLE public.resources
    ADD COLUMN current_holder_id uuid NULL;

ALTER TABLE public.resources
    ADD CONSTRAINT resources_current_holder_id_fkey
    FOREIGN KEY (current_holder_id) REFERENCES public.profiles (id) ON DELETE SET NULL;

UPDATE public.resources SET current_holder_id = owner_id WHERE current_holder_id IS NULL;

ALTER TABLE public.resources
    ALTER COLUMN current_holder_id SET NOT NULL;

CREATE INDEX resources_current_holder_idx ON public.resources (current_holder_id);