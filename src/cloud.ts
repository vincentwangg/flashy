import {supabase} from './supabase';
export type CloudCard={id:string;deck:string;front:string;back:string;streak:number;mastered:boolean;attempts:number;mastery_confidence:number;definition_mastery_confidence:number;next_review_count?:number|null;definition_streak:number;definition_mastered:boolean;definition_next_review_count?:number|null};
export async function fetchCloud(userId:string){
 if(!supabase)throw Error('Supabase is not configured');
 const [cards,decks]=await Promise.all([
  supabase.from('flashy_cards').select('id,deck,front,back,streak,mastered,attempts,mastery_confidence,definition_mastery_confidence,next_review_count,definition_streak,definition_mastered,definition_next_review_count').eq('user_id',userId).order('updated_at',{ascending:false}).limit(10000),
  supabase.from('flashy_decks').select('name,review_count,definition_review_count').eq('user_id',userId).limit(10000)
 ]);
 if(cards.error)throw cards.error;if(decks.error)throw decks.error;
 return {cards:cards.data as CloudCard[],decks:decks.data.map(d=>d.name),deckCounters:Object.fromEntries(decks.data.map(d=>[d.name,{term:d.review_count as number,definition:d.definition_review_count as number}]))};
}
export async function uploadCloud(userId:string,cards:CloudCard[],decks:string[]){
 if(!supabase)throw Error('Supabase is not configured');
 const names=[...new Set([...decks,...cards.map(c=>c.deck)])];
 if(names.length){const result=await supabase.from('flashy_decks').upsert(names.map(name=>({user_id:userId,name})),{onConflict:'user_id,name'});if(result.error)throw result.error;}
 // Upsert by UUID; never delete cloud records during import.
 for(let i=0;i<cards.length;i+=200){
  const result=await supabase.from('flashy_cards').upsert(cards.slice(i,i+200).map(c=>({...c,mastery_confidence:c.mastery_confidence??0,definition_mastery_confidence:c.definition_mastery_confidence??0,definition_streak:c.definition_streak??0,definition_mastered:c.definition_mastered??false,definition_next_review_count:c.definition_next_review_count??null,user_id:userId})),{onConflict:'id'});
  if(result.error)throw result.error;
 }
}

export async function deleteCloudCard(userId:string,cardId:string){
 if(!supabase)throw Error('Supabase is not configured');
 const {data,error}=await supabase.from('flashy_cards').delete().eq('user_id',userId).eq('id',cardId).select('id');
 if(error)throw error;
 if(!data?.length)throw Error('Card was not deleted. Check database permissions or refresh.');
}

export async function saveReviewCount(userId:string,deck:string,direction:'term'|'definition',count:number){
 if(!supabase)throw Error('Supabase is not configured');
 const column=direction==='term'?'review_count':'definition_review_count';
 const {error}=await supabase.from('flashy_decks').update({[column]:count}).eq('user_id',userId).eq('name',deck);
 if(error)throw error;
}
