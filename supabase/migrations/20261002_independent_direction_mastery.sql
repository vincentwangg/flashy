-- Apply in Supabase SQL Editor before deploying this PR. Existing mastery stays Term first.
begin;
alter table public.flashy_decks add column if not exists definition_review_count integer not null default 0;
alter table public.flashy_cards add column if not exists definition_streak integer not null default 0;
alter table public.flashy_cards add column if not exists definition_mastered boolean not null default false;
alter table public.flashy_cards add column if not exists definition_next_review_count integer;

-- Replace the previous RPC with a direction-aware transaction.
drop function if exists public.flashy_submit_review(uuid,text,uuid,boolean);
create function public.flashy_submit_review(
 p_card_id uuid,p_grade text,p_request_id uuid,p_direction text default 'term'
) returns table(deck_review_count integer,card_streak integer,card_mastered boolean,card_next_review_count integer)
language plpgsql security definer set search_path=public
as $$
declare
 v_user uuid:=auth.uid();
 v_card public.flashy_cards%rowtype;
 v_count integer;
 v_streak integer;
 v_next integer;
 v_mastered boolean;
 v_delta integer;
begin
 if v_user is null then raise exception 'Sign in required'; end if;
 if p_grade not in ('again','good') or p_direction not in ('term','definition') then raise exception 'Invalid review'; end if;
 if p_request_id is null then raise exception 'Request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 select * into v_card from public.flashy_cards where id=p_card_id and user_id=v_user for update;
 if not found then raise exception 'Card not found'; end if;
 if p_direction='term' then
   select d.review_count into v_count from public.flashy_decks d where d.user_id=v_user and d.name=v_card.deck for update;
 else
   select d.definition_review_count into v_count from public.flashy_decks d where d.user_id=v_user and d.name=v_card.deck for update;
 end if;
 if not found then raise exception 'Deck not found'; end if;
 if exists(select 1 from public.flashy_review_events where user_id=v_user and request_id=p_request_id) then
   if p_direction='term' then
     return query select v_count,v_card.streak,v_card.mastered,v_card.next_review_count;
   else
     return query select v_count,v_card.definition_streak,v_card.definition_mastered,v_card.definition_next_review_count;
   end if;
   return;
 end if;
 insert into public.flashy_review_events(user_id,request_id) values(v_user,p_request_id);
 if v_count>=2000000000 then
   v_delta:=v_count;
   if p_direction='term' then
     update public.flashy_cards set next_review_count=next_review_count-v_delta
       where user_id=v_user and deck=v_card.deck and next_review_count is not null;
   else
     update public.flashy_cards set definition_next_review_count=definition_next_review_count-v_delta
       where user_id=v_user and deck=v_card.deck and definition_next_review_count is not null;
   end if;
   v_count:=0;
 end if;
 v_count:=v_count+1;
 v_streak:=case when p_grade='again'
   then greatest(0,least(4,case when p_direction='term' then v_card.streak else v_card.definition_streak end)-1)
   else least(4,(case when p_direction='term' then v_card.streak else v_card.definition_streak end)+1) end;
 v_mastered:=v_streak=4;
 v_next:=case when v_mastered then v_count+50+floor(random()*51)::integer else null end;
 if p_direction='term' then
   update public.flashy_decks set review_count=v_count where user_id=v_user and name=v_card.deck;
   update public.flashy_cards set streak=v_streak,mastered=v_mastered,next_review_count=v_next,
      attempts=v_card.attempts+1 where id=p_card_id and user_id=v_user;
 else
   update public.flashy_decks set definition_review_count=v_count where user_id=v_user and name=v_card.deck;
   update public.flashy_cards set definition_streak=v_streak,definition_mastered=v_mastered,
      definition_next_review_count=v_next,attempts=v_card.attempts+1 where id=p_card_id and user_id=v_user;
 end if;
 return query select v_count,v_streak,v_mastered,v_next;
end;
$$;
revoke all on function public.flashy_submit_review(uuid,text,uuid,text) from public,anon;
grant execute on function public.flashy_submit_review(uuid,text,uuid,text) to authenticated;
commit;
