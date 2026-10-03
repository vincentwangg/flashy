-- Confidence is stored independently for each review direction.
-- Review scheduling stays in the TypeScript frontend; no RPC changes.
alter table public.flashy_cards
  add column if not exists mastery_confidence integer not null default 0
    check (mastery_confidence between 0 and 4),
  add column if not exists definition_mastery_confidence integer not null default 0
    check (definition_mastery_confidence between 0 and 4);
