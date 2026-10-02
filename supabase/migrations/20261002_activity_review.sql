-- Run this migration in Supabase SQL Editor before deploying the activity-based review UI.
alter table public.flashy_decks add column if not exists review_count integer not null default 0;
alter table public.flashy_cards add column if not exists next_review_count integer;
create index if not exists flashy_cards_due_idx on public.flashy_cards(user_id, deck, next_review_count);

-- One answer is one transaction: increment only the selected deck and update its card.
-- An idempotency key prevents double-counting when the client retries an uncertain response.
create table if not exists public.flashy_review_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  primary key (user_id, request_id)
);
alter table public.flashy_review_events enable row level security;
-- No direct client access: only the security-definer RPC writes events.
revoke all on public.flashy_review_events from anon, authenticated;

create or replace function public.flashy_submit_review(
  p_card_id uuid, p_grade text, p_request_id uuid, p_continuous boolean default false
) returns table(deck_review_count integer, card_streak integer, card_mastered boolean, card_next_review_count integer)
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_card public.flashy_cards%rowtype;
  v_count integer;
  v_streak integer;
  v_mastered boolean;
  v_next integer;
  v_delta integer;
begin
  if v_user is null then raise exception 'Sign in required'; end if;
  if p_grade not in ('again','good') then raise exception 'Invalid grade'; end if;
  if p_request_id is null then raise exception 'Request ID required'; end if;
  -- Serialize requests for this user; also protects the reset from concurrent submissions.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_card from public.flashy_cards where id=p_card_id and user_id=v_user for update;
  if not found then raise exception 'Card not found'; end if;
  select d.review_count into v_count from public.flashy_decks d
    where d.user_id=v_user and d.name=v_card.deck for update;
  if not found then raise exception 'Deck not found'; end if;
  if exists(select 1 from public.flashy_review_events where user_id=v_user and request_id=p_request_id) then
    return query select v_count,v_card.streak,v_card.mastered,v_card.next_review_count;
    return;
  end if;
  insert into public.flashy_review_events(user_id,request_id) values(v_user,p_request_id);
  -- Reset before overflow; preserve remaining waits, including already overdue cards.
  if v_count >= 2000000000 then
    v_delta := v_count;
    update public.flashy_cards
       set next_review_count=next_review_count-v_delta
     where user_id=v_user and deck=v_card.deck and next_review_count is not null;
    update public.flashy_decks set review_count=0 where user_id=v_user and name=v_card.deck;
    v_count := 0;
  end if;
  v_count := v_count+1;
  v_streak := case when p_grade='again' then greatest(0,least(4,v_card.streak)-1)
                   else least(4,v_card.streak+1) end;
  v_mastered := v_streak=4;
  -- A due mastered card answered correctly remains mastered and receives a fresh interval.
  -- All successful mastery reviews use the same 50–100 activity interval.
  v_next := case when v_mastered then v_count+50+floor(random()*51)::integer else null end;
  update public.flashy_decks set review_count=v_count where user_id=v_user and name=v_card.deck;
  update public.flashy_cards set streak=v_streak,mastered=v_mastered,
      attempts=v_card.attempts+1,next_review_count=v_next
    where id=p_card_id and user_id=v_user;
  return query select v_count,v_streak,v_mastered,v_next;
end;
$$;
revoke all on function public.flashy_submit_review(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.flashy_submit_review(uuid,text,uuid,boolean) to authenticated;
