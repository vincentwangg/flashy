-- Only confidence columns are required for local-first reviews.
-- Run in Supabase SQL Editor before deploying the updated frontend.
begin;
alter table public.flashy_cards add column if not exists mastery_confidence integer not null default 0 check (mastery_confidence between 0 and 4);
alter table public.flashy_cards add column if not exists definition_mastery_confidence integer not null default 0 check (definition_mastery_confidence between 0 and 4);
commit;
-- The existing review RPC is no longer called. It can be removed separately later.
