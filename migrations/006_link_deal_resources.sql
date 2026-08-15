-- Lets a Deal optionally point at a specific Resource or Skill being
-- requested/offered against, rather than only free-text category/title.
-- Both nullable — a Deal can still be purely descriptive with neither.

ALTER TABLE public.deals
    ADD COLUMN resource_id uuid NULL,
    ADD COLUMN skill_id uuid NULL;

ALTER TABLE public.deals
    ADD CONSTRAINT deals_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources (id) ON DELETE SET NULL,
    ADD CONSTRAINT deals_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills (id) ON DELETE SET NULL;

CREATE INDEX deals_resource_idx ON public.deals (resource_id);
CREATE INDEX deals_skill_idx ON public.deals (skill_id);