import {supabase} from './supabase';
export type CloudCard={id:string;deck:string;front:string;back:string;streak:number;mastered:boolean;attempts:number};
export async function fetchCloud(userId:string){
 if(!supabase)throw Error('Supabase is not configured');
 const [cards,decks]=await Promise.all([
  supabase.from('flashy_cards').select('id,deck,front,back,streak,mastered,attempts').eq('user_id',userId).order('updated_at',{ascending:false}).limit(10000),
  supabase.from('flashy_decks').select('name').eq('user_id',userId).limit(10000)
 ]);
 if(cards.error)throw cards.error;if(decks.error)throw decks.error;
 return {cards:cards.data as CloudCard[],decks:decks.data.map(d=>d.name)};
}
export async function uploadCloud(userId:string,cards:CloudCard[],decks:string[]){
 if(!supabase)throw Error('Supabase is not configured');
 const names=[...new Set([...decks,...cards.map(c=>c.deck)])];
 if(names.length){const result=await supabase.from('flashy_decks').upsert(names.map(name=>({user_id:userId,name})),{onConflict:'user_id,name'});if(result.error)throw result.error;}
 // Upsert by UUID; never delete cloud records during import.
 for(let i=0;i<cards.length;i+=200){
  const result=await supabase.from('flashy_cards').upsert(cards.slice(i,i+200).map(c=>({...c,user_id:userId})),{onConflict:'id'});
  if(result.error)throw result.error;
 }
}
