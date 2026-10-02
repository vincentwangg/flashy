import React, {useEffect, useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from './supabase';
import {fetchCloud,uploadCloud,deleteCloudCard,submitReview} from './cloud';
import {createRoot} from 'react-dom/client';
import './style.css';
type Card={id:string;deck:string;front:string;back:string;streak:number;mastered:boolean;attempts:number;next_review_count?:number|null;definition_streak:number;definition_mastered:boolean;definition_next_review_count?:number|null};
const KEY='my-flashcards-mastery-v1';
const DECKS_KEY='my-flashcards-decks-v1';
function loadDecks():string[]{try{const value=JSON.parse(localStorage.getItem(DECKS_KEY)||'[]');return Array.isArray(value)?value.filter((d):d is string=>typeof d==='string'&&!!d.trim()):[]}catch{return []}}
function load():Card[]{try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(c=>typeof c.id==='string'&&typeof c.front==='string'&&typeof c.back==='string'&&typeof c.deck==='string'&&typeof c.streak==='number'&&typeof c.mastered==='boolean'):[]}catch{return []}}
function App(){
 const [user,setUser]=useState<User|null>(null);
 const [authReady,setAuthReady]=useState(false);
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [authMessage,setAuthMessage]=useState('');
 const [authBusy,setAuthBusy]=useState(false);
 const [cloudBusy,setCloudBusy]=useState(false);
 const [cloudReady,setCloudReady]=useState(false);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [editFront,setEditFront]=useState('');
 const [editBack,setEditBack]=useState('');
 const [editDeck,setEditDeck]=useState('');
 const [manageBusy,setManageBusy]=useState(false);
 useEffect(()=>{if(!supabase){setAuthMessage('Set up .env.local using .env.example.');setAuthReady(true);return;}void supabase.auth.getUser().then(({data,error})=>{setUser(data.user);if(error)setAuthMessage(error.message);setAuthReady(true)});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user??null));return()=>subscription.unsubscribe()},[]);
 async function authenticate(mode:'signIn'|'signUp'){if(!supabase)return;setAuthBusy(true);const result=mode==='signIn'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});setAuthBusy(false);setPassword('');setAuthMessage(result.error?.message??(mode==='signUp'?'Account created. Confirm your email if required.':'Signed in.'));}

 const [cards,setCards]=useState<Card[]>(load);
 const [savedDecks,setSavedDecks]=useState<string[]>(loadDecks);
 const [newDeck,setNewDeck]=useState('');
 const [deck,setDeck]=useState(()=>localStorage.getItem('my-flashcards-last-deck')||'General'),[front,setFront]=useState(''),[back,setBack]=useState('');
 const [activeDeck,setActiveDeck]=useState(()=>localStorage.getItem('my-flashcards-last-deck')||'General'),[flipped,setFlipped]=useState(false),[message,setMessage]=useState('');
 const [deckCounters,setDeckCounters]=useState<Record<string,{term:number;definition:number}>>({});
 const [retryDue,setRetryDue]=useState<Record<string,number>>({});
 const [continuous,setContinuous]=useState(false);
 const [queue,setQueue]=useState<string[]>([]);
 const [revealedId,setRevealedId]=useState<string|null>(null);
 const [grading,setGrading]=useState(false);
 const [reviewDirection,setReviewDirection]=useState<'term'|'definition'>(()=>localStorage.getItem('flashy-review-direction')==='definition'?'definition':'term');
 // Cloud data is authoritative after sign-in. Never automatically upload old browser data.
 useEffect(()=>{
  let cancelled=false;
  setCloudReady(false);
  if(!user){setCards([]);setSavedDecks([]);return;}
  async function refresh(){
   try{const remote=await fetchCloud(user!.id);if(cancelled)return;setCards(remote.cards);setSavedDecks(remote.decks);setDeckCounters(remote.deckCounters);setCloudReady(true)}
   catch(error){if(!cancelled)setMessage('Cloud load failed: '+(error instanceof Error?error.message:String(error)))}
  }
  void refresh();
  const onFocus=()=>{if(document.visibilityState==='visible'&&!cancelled)void refresh()};
  document.addEventListener('visibilitychange',onFocus);
  return()=>{cancelled=true;document.removeEventListener('visibilitychange',onFocus)};
 },[user?.id]);
 function save(next:Card[]){setCards(next)}
 async function persistCards(next:Card[],changed:Card[]){save(next);try{await uploadCloud(user!.id,changed,[]);setMessage('Saved to cloud')}catch(error){setMessage('Cloud save failed; retry your action after reconnecting: '+(error instanceof Error?error.message:String(error)))}}
 const availableDecks=[...new Set(['General',...savedDecks,...cards.map(c=>c.deck)])];
 const decks=availableDecks;
 function chooseDeck(value:string){setDeck(value);localStorage.setItem('my-flashcards-last-deck',value)}
 async function createDeck(e:React.FormEvent){e.preventDefault();const name=newDeck.trim();if(!name)return;if(availableDecks.some(d=>d.toLowerCase()===name.toLowerCase())){setMessage('That deck already exists');return}const next=[...savedDecks,name];setSavedDecks(next);try{await uploadCloud(user!.id,[],[name])}catch(error){setMessage('Cloud deck save failed: '+String(error));return}chooseDeck(name);setActiveDeck(name);setDeckCounters(prev=>({...prev,[name]:{term:0,definition:0}}));setNewDeck('');setFlipped(false);setQueue([]);setMessage('Deck created and selected for new cards')}
function shuffleIds(ids:string[]){const result=[...ids];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
 const deckCards=cards.filter(c=>c.deck===activeDeck);
 const deckCount=deckCounters[activeDeck]?.[reviewDirection]??0;
 const mastery=(c:Card)=>reviewDirection==='term'?c.streak:c.definition_streak;
 const mastered=(c:Card)=>reviewDirection==='term'?c.mastered:c.definition_mastered;
 const nextReview=(c:Card)=>reviewDirection==='term'?c.next_review_count:c.definition_next_review_count;
 // Stable ordering ensures the next five words are introduced gradually.
 // Each word reaching 3/4 opens one additional slot; introduced words remain available.
 const orderedDeckCards=[...deckCards].sort((a,b)=>a.id.localeCompare(b.id));
 const learningSlots=Math.min(orderedDeckCards.length,5+orderedDeckCards.filter(c=>mastery(c)>=3).length);
 const introducedIds=new Set(orderedDeckCards.slice(0,learningSlots).map(c=>c.id));
 const allMastered=deckCards.length>0&&deckCards.every(mastered);
 // Once a fully-mastered deck starts continuous review, a missed card must not stop it.
 const inContinuous=continuous||allMastered;
 const eligible=deckCards.filter(c=>introducedIds.has(c.id)&&(retryDue[c.id]==null||retryDue[c.id]<=deckCount)&& (inContinuous||!mastered(c)||
   nextReview(c)==null||nextReview(c)!<=deckCount||
   nextReview(c)!-deckCount>10000));
 useEffect(()=>{setContinuous(false);setRetryDue({});setQueue([])},[activeDeck,reviewDirection]);
 useEffect(()=>{setQueue(prev=>{
  const ids=new Set(eligible.map(c=>c.id));
  const kept=prev.filter(id=>ids.has(id));
  const dueRetries=Object.entries(retryDue).filter(([id,count])=>count<=deckCount&&ids.has(id)).map(([id])=>id);
  const newRetries=dueRetries.filter(id=>!kept.includes(id));
  if(newRetries.length)return [...newRetries,...kept];
  return kept.length?kept:shuffleIds([...ids]);
 })},[activeDeck,cards,deckCount,continuous,retryDue]);
 const current=queue.length?eligible.find(c=>c.id===queue[0]):undefined;
 async function add(e:React.FormEvent){e.preventDefault();if(!front.trim()||!back.trim()||!deck.trim())return;const card={id:crypto.randomUUID(),deck:deck.trim(),front:front.trim(),back:back.trim(),streak:0,mastered:false,attempts:0,definition_streak:0,definition_mastered:false,definition_next_review_count:null};await persistCards([...cards,card],[card]);setFront('');setBack('');setMessage('Card added')}
 async function review(grade:'again'|'good') {
  if(!current||grading)return;
  setGrading(true);
  const requestId=crypto.randomUUID();
  try{
   const result=await submitReview(current.id,grade,requestId,reviewDirection);
   const newCount=result.deck_review_count;
   const changed={...current,attempts:current.attempts+1,...(reviewDirection==='term'?
    {streak:result.card_streak,mastered:result.card_mastered,next_review_count:result.card_next_review_count}:
    {definition_streak:result.card_streak,definition_mastered:result.card_mastered,definition_next_review_count:result.card_next_review_count})};
   const nextCards=cards.map(c=>c.id===current.id?changed:c);
   const nowContinuous=inContinuous;
   setCards(nextCards);
   setDeckCounters(prev=>({...prev,[activeDeck]:{term:prev[activeDeck]?.term??0,definition:prev[activeDeck]?.definition??0,[reviewDirection]:newCount}}));
   if(nowContinuous)setContinuous(true);
   if(grade==='again'&&mastered(current)){
    const wait=Math.min(Math.max(1,deckCards.length-1),5+Math.floor(Math.random()*6));
    setRetryDue(prev=>({...prev,[current.id]:newCount+wait}));
   }else setRetryDue(prev=>{const next={...prev};delete next[current.id];return next});
   setQueue(prev=>{
    const remaining=prev.filter(id=>id!==current.id);
    if(remaining.length)return remaining;
    const nextOrdered=[...nextCards.filter(c=>c.deck===activeDeck)].sort((a,b)=>a.id.localeCompare(b.id));
    const nextSlots=Math.min(nextOrdered.length,5+nextOrdered.filter(c=>reviewDirection==='term'?c.streak>=3:c.definition_streak>=3).length);
    const nextIntroduced=new Set(nextOrdered.slice(0,nextSlots).map(c=>c.id));
    const pool=nextCards.filter(c=>c.deck===activeDeck&&nextIntroduced.has(c.id)&&c.id!==current.id&&
      (nowContinuous||!mastered(c)||nextReview(c)==null||nextReview(c)!<=newCount));
    return shuffleIds(pool.map(c=>c.id));
   });
   setFlipped(false);setRevealedId(null);
   setMessage(result.card_mastered?'Word mastered or reinforced!':'Saved to cloud');
  }catch(error){
   setMessage('Review not saved; try again: '+(error instanceof Error?error.message:String(error)));
  }finally{setGrading(false)}
 }
 async function cloudTransfer(mode:'upload'|'download'){
  if(!user||cloudBusy)return;
  setCloudBusy(true);
  try{
   if(mode==='upload'){
    if(!window.confirm('Upload local cards to your cloud account? Cards with the same ID in the cloud will be replaced. Export a backup first.'))return;
    await uploadCloud(user.id,cards,savedDecks);
    setMessage('Local cards and decks uploaded to your account.');
   }else{
    const remote=await fetchCloud(user.id);
    const conflicts=remote.cards.filter(c=>cards.some(local=>local.id===c.id&&JSON.stringify(local)!==JSON.stringify(c)));
    if(conflicts.length&&!window.confirm('Some cloud cards differ from local cards. Downloading will use the cloud versions for matching IDs. Continue?'))return;
    const merged=new Map(cards.map(c=>[c.id,c]));remote.cards.forEach(c=>merged.set(c.id,c));
    save([...merged.values()]);
    const names=[...new Set([...savedDecks,...remote.decks])];setSavedDecks(names);setDeckCounters(remote.deckCounters);
    setMessage('Cloud cards downloaded and merged with local cards.');
   }
  }catch(error){setMessage('Cloud transfer failed: '+(error instanceof Error?error.message:String(error)))}finally{setCloudBusy(false)}
 }
 function startEdit(card:Card){setEditingId(card.id);setEditFront(card.front);setEditBack(card.back);setEditDeck(card.deck)}
 async function applyEdit(e:React.FormEvent){
  e.preventDefault();
  if(!user||!editingId||manageBusy||!editFront.trim()||!editBack.trim())return;
  const original=cards.find(c=>c.id===editingId);if(!original)return;
  const changed={...original,front:editFront.trim(),back:editBack.trim(),deck:editDeck};
  setManageBusy(true);
  try{await uploadCloud(user.id,[changed],[]);setCards(prev=>prev.map(c=>c.id===changed.id?changed:c));setEditingId(null);setMessage('Card updated in cloud')}
  catch(error){setMessage('Edit failed; no local changes applied: '+String(error))}
  finally{setManageBusy(false)}
 }
 async function resetMastery(card:Card){
  if(!user||manageBusy||grading||!window.confirm('Reset both Term first and Definition first mastery for "'+card.front+'" to 0/4? This clears both scheduled reviews.'))return;
  const changed={...card,streak:0,mastered:false,next_review_count:null,definition_streak:0,definition_mastered:false,definition_next_review_count:null};
  setManageBusy(true);
  try{
   await uploadCloud(user.id,[changed],[]);
   setCards(prev=>prev.map(c=>c.id===card.id?changed:c));
   setRetryDue(prev=>{const next={...prev};delete next[card.id];return next});
   setQueue([]);setContinuous(false);setFlipped(false);setRevealedId(null);
   setMessage('Both mastery directions reset and saved to cloud');
  }catch(error){setMessage('Reset failed; mastery unchanged: '+String(error))}
  finally{setManageBusy(false)}
 }
 async function removeCard(card:Card){
  if(!user||manageBusy||!window.confirm('Permanently delete "'+card.front+'" from your cloud account?'))return;
  setManageBusy(true);
  try{await deleteCloudCard(user.id,card.id);setCards(prev=>prev.filter(c=>c.id!==card.id));setQueue(prev=>prev.filter(id=>id!==card.id));if(editingId===card.id)setEditingId(null);setFlipped(false);setMessage('Card deleted from cloud')}
  catch(error){setMessage('Delete failed; card kept: '+String(error))}
  finally{setManageBusy(false)}
 }
 function exportCards(){const url=URL.createObjectURL(new Blob([JSON.stringify(cards,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='flashcards-backup.json';a.click();URL.revokeObjectURL(url)}
 async function importCards(file:File){try{const raw=JSON.parse(await file.text());if(!Array.isArray(raw)||!raw.every(c=>typeof c.id==='string'&&typeof c.deck==='string'&&typeof c.front==='string'&&typeof c.back==='string'&&Number.isInteger(c.streak)&&c.streak>=0&&typeof c.mastered==='boolean'&&Number.isInteger(c.attempts)&&c.attempts>=0))throw Error('Invalid file');const merged=new Map(cards.map(c=>[c.id,c]));raw.forEach((c:Card)=>merged.set(c.id,c));save([...merged.values()]);setMessage('Backup loaded in memory. Click Upload to cloud to preserve it across devices.')}catch{setMessage('Invalid mastery backup file')}}
 if(!authReady)return <main><p>Loading…</p></main>;
 if(!user)return <main><header><h1>Flashy</h1><p>Sign in to your account.</p></header><section><h2>Account</h2><form onSubmit={e=>{e.preventDefault();void authenticate('signIn')}}><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" autoComplete="current-password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="actions"><button disabled={authBusy||!supabase} type="submit">Sign in</button><button disabled={authBusy||!supabase} type="button" onClick={()=>void authenticate('signUp')}>Create account</button></div></form>{authMessage&&<p role="status">{authMessage}</p>}</section></main>;
 if(!cloudReady)return <main><p>Loading your cloud data…</p>{message&&<p role="alert">{message}</p>}<button onClick={()=>window.location.reload()}>Retry</button></main>;
 return <main><header><h1>Flashy</h1><p>Learn at your own pace. Activity-based reviews. Cards and mastery changes save to Supabase. Open the app on another device to load your progress.</p><p>Signed in as {user.email} <button onClick={()=>void supabase?.auth.signOut()}>Sign out</button></p></header><section className="stats"><span>{cards.length} total cards</span><span>{cards.filter(mastered).length} mastered</span><span>{cards.filter(c=>!mastered(c)).length} learning</span></section><section><h2>Study</h2><label>Deck <select value={activeDeck} onChange={e=>{setActiveDeck(e.target.value);chooseDeck(e.target.value);setFlipped(false);setQueue([])}}>{decks.map(d=><option key={d}>{d}</option>)}</select></label><label>Review direction <select value={reviewDirection} onChange={e=>{const value=e.target.value as 'term'|'definition';setReviewDirection(value);localStorage.setItem('flashy-review-direction',value);setFlipped(false);setRevealedId(null);setQueue([])}}><option value="term">Term first</option><option value="definition">Definition first</option></select></label><p>{learningSlots} of {deckCards.length} words introduced in this direction · New words unlock at 3/4 mastery.</p>{current?<><button className="flashcard" onClick={()=>{if(!flipped)setRevealedId(current.id);setFlipped(!flipped)}}><small>{flipped?'ANSWER':'QUESTION'} · {current.deck}</small><strong>{reviewDirection==='term'?(flipped?current.back:current.front):(flipped?current.front:current.back)}</strong><small>Tap to flip · {mastery(current)}/4 mastery points</small></button>{revealedId===current.id&&<div className="actions"><button type="button" disabled={grading} aria-label="Incorrect" title="Incorrect" onClick={()=>void review('again')} style={{background:"#b91c1c",color:"white",fontSize:"1.5rem"}}>✕</button><button type="button" disabled={grading} aria-label="Correct" title="Correct" onClick={()=>void review('good')} style={{background:"#15803d",color:"white",fontSize:"1.5rem"}}>✓</button></div>}</>:<p>{'No cards currently available in this deck.'}</p>}</section><section><h2>Create a deck</h2><form onSubmit={createDeck}><label>New deck name<input value={newDeck} maxLength={80} onChange={e=>setNewDeck(e.target.value)} placeholder="e.g. Genki Chapter 1" required/></label><button type="submit">Create deck</button></form></section><section><h2>Add a card</h2><form onSubmit={add}><label>Deck<select value={deck} onChange={e=>chooseDeck(e.target.value)}>{availableDecks.map(d=><option key={d} value={d}>{d}</option>)}</select></label><label>Term<input value={front} maxLength={500} onChange={e=>setFront(e.target.value)} required/></label><label>Definition<textarea value={back} maxLength={3000} onChange={e=>setBack(e.target.value)} required/></label><button type="submit">Add card</button></form></section><section><h2>Manage cards</h2><p>Edit a card or permanently delete it from your account.</p><label>Deck <select value={activeDeck} onChange={e=>setActiveDeck(e.target.value)}>{decks.map(d=><option key={d}>{d}</option>)}</select></label>{cards.filter(c=>c.deck===activeDeck).map(card=><div key={card.id} className="managed-card"><p><strong>{card.front}</strong> — {card.back} <small>({card.deck}) · Term: {card.streak}/4{card.mastered?" · Mastered":""}{card.mastered&&card.next_review_count!=null?" · Returns in "+Math.max(0,card.next_review_count-(deckCounters[card.deck]?.term??0))+" reviews":""} | Definition: {card.definition_streak}/4{card.definition_mastered?" · Mastered":""}{card.definition_mastered&&card.definition_next_review_count!=null?" · Returns in "+Math.max(0,card.definition_next_review_count-(deckCounters[card.deck]?.definition??0))+" reviews":""}</small></p>{editingId===card.id?<form onSubmit={e=>void applyEdit(e)}><label>Deck<select value={editDeck} onChange={e=>setEditDeck(e.target.value)}>{availableDecks.map(d=><option key={d}>{d}</option>)}</select></label><label>Term<input required maxLength={500} value={editFront} onChange={e=>setEditFront(e.target.value)}/></label><label>Definition<textarea required maxLength={3000} value={editBack} onChange={e=>setEditBack(e.target.value)}/></label><div className="actions"><button type="submit" disabled={manageBusy}>Save changes</button><button type="button" disabled={manageBusy} onClick={()=>setEditingId(null)}>Cancel</button></div></form>:<div className="actions"><button disabled={manageBusy} onClick={()=>startEdit(card)}>Edit</button><button disabled={manageBusy||grading} onClick={()=>void resetMastery(card)}>Reset mastery</button><button disabled={manageBusy} onClick={()=>void removeCard(card)}>Delete</button></div>}</div>)}</section><section><h2>Backup migration and recovery</h2><p>Export a JSON backup first. Upload saves this browser’s cards to your account. Download reloads cloud cards. Normal edits automatically save to cloud.</p><div className="actions"><button disabled={cloudBusy} onClick={()=>void cloudTransfer('upload')}>Upload to cloud</button><button disabled={cloudBusy} onClick={()=>void cloudTransfer('download')}>Download from cloud</button></div></section><section><h2>Backups</h2><div className="actions"><button onClick={exportCards}>Export JSON</button><label className="import">Import JSON<input type="file" accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void importCards(f);e.target.value=''}}/></label></div><p className="hint">Export backups regularly. Normal changes save automatically. Importing an old JSON backup requires Upload to cloud.</p></section>{message&&<p role="status">{message}</p>}</main>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
