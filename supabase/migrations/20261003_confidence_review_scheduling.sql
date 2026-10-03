-- Apply in Supabase SQL Editor before deploying the confidence feature.
-- Existing mastery and next review dates are preserved; confidence starts at zero.
begin;
alter table public.flashy_cards add column if not exists mastery_confidence integer not null default 0 check (mastery_confidence between 0 and 4);
alter table public.flashy_cards add column if not exists definition_mastery_confidence integer not null default 0 check (definition_mastery_confidence between 0 and 4);

-- Replace the direction-aware review RPC with confidence-aware scheduling.
drop function if exists public.flashy_submit_review(uuid,text,uuid,text);
create function public.flashy_submit_review(
 p_card_id uuid,p_grade text,p_request_id uuid,p_direction text default 'term'
) returns table(deck_review_count integer,card_streak integer,card_mastered boolean,card_next_review_count integer,card_confidence integer)
language plpgsql security definer set search_path=public
as $$
declare
 v_user uuid:=auth.uid(); v_card public.flashy_cards%rowtype;
 v_count integer;v_streak integer;v_next integer;v_mastered boolean;
 v_delta integer;v_confidence integer;v_was_mastered boolean;
 v_low integer;v_high integer;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_grade not in ('again','good') or p_direction not in ('term','definition') then raise exception 'Invalid review'; end if;
 if p_request_id is null then raise exception 'Request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 select * into v_card from public.flashy_cards where id=p_card_id and user_id=v_user for update;
 if not found then raise exception 'Card not found'; end if;
 if p_direction='term' then
  select d.review_count into v_count from public.flashy_decks d where d.user_id=v_user and d.name=v_card.deck for update;
  v_streak:=v_card.streak;v_confidence:=v_card.mastery_confidence;v_was_mastered:=v_card.mastered;
 else
  select d.definition_review_count into v_count from public.flashy_decks d where d.user_id=v_user and d.name=v_card.deck for update;
  v_streak:=v_card.definition_streak;v_confidence:=v_card.definition_mastery_confidence;v_was_mastered:=v_card.definition_mastered;
 end if;
 if not found then raise exception 'Deck not found'; end if;
 if exists(select 1 from public.flashy_review_events where user_id=v_user and request_id=p_request_id) then
  if p_direction='term' then
   return query select v_count,v_card.streak,v_card.mastered,v_card.next_review_count,v_card.mastery_confidence;
  else
   return query select v_count,v_card.definition_streak,v_card.definition_mastered,v_card.definition_next_review_count,v_card.definition_mastery_confidence;
  end if;
  return;
 end if;
 insert into public.flashy_review_events(user_id,request_id) values(v_user,p_request_id);
 if v_count>=2000000000 then
  v_delta:=v_count;
  if p_direction='term' then
   update public.flashy_cards set next_review_count=next_review_count-v_delta where user_id=v_user and deck=v_card.deck and next_review_count is not null;
  else
   update public.flashy_cards set definition_next_review_count=definition_next_review_count-v_delta where user_id=v_user and deck=v_card.deck and definition_next_review_count is not null;
  end if;
  v_count:=0;
 end if;
 v_count:=v_count+1;
 if p_grade='again' then
  v_streak:=greatest(0,v_streak-1);v_confidence:=0;
 else
  v_streak:=least(4,v_streak+1);
  if v_was_mastered then v_confidence:=least(4,v_confidence+1);end if;
 end if;
 v_mastered:=v_streak=4;
 v_next:=null;
 if v_mastered then
  -- Confidence 0/1/2/3/4: ~50/150/400/850/1750 other reviews.
  case v_confidence
   when 0 then v_low:=40;v_high:=60;
   when 1 then v_low:=125;v_high:=175;
   when 2 then v_low:=350;v_high:=450;
   when 3 then v_low:=750;v_high:=950;
   else v_low:=1500;v_high:=2000;
  end case;
  v_next:=v_count+v_low+floor(random()*(v_high-v_low+1))::integer;
 end if;
 if p_direction='term' then
  update public.flashy_decks set review_count=v_count where user_id=v_user and name=v_card.deck;
  update public.flashy_cards set streak=v_streak,mastered=v_mastered,next_review_count=v_next,mastery_confidence=v_confidence where id=p_card_id and user_id=v_user;
 else
  update public.flashy_decks set definition_review_count=v_count where user_id=v_user and name=v_card.deck;
  update public.flashy_cards set definition_streak=v_streak,definition_mastered=v_mastered,definition_next_review_count=v_next,definition_mastery_confidence=v_confidence where id=p_card_id and user_id=v_user;
 end if;
 return query select v_count,v_streak,v_mastered,v_next,v_confidence;
end;
$$;
revoke all on function public.flashy_submit_review(uuid,text,uuid,text) from public,anon;
grant execute on function public.flashy_submit_review(uuid,text,uuid,text) to authenticated;
commit;
