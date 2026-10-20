import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {BroadcastState,Champion,Side} from '../../../shared/types';
import {productionKey} from '../../../shared/production';
import {ChampionImage} from './ProgramPrimitives';

type Reveal={token:number;id:string;index:number;left:number;width:number};
const selecting=(action:string)=>/^(选择英雄|选人|pick|人工 BP)$/i.test(action.trim());
const bounds=(index:number,active?:number)=>{
 const weights=Array.from({length:5},(_,i)=>i===active?2.2:1),total=weights.reduce((a,b)=>a+b,0);
 return {left:weights.slice(0,index).reduce((a,b)=>a+b,0)/total*100,width:weights[index]/total*100};
};
/** Local visual events: initial snapshots, swaps and repeated polls never replay a lock. */
export function DraftLockReveal({state,side,champions,activeIndex}:{state:BroadcastState;side:Side;champions:Champion[];activeIndex?:number}){
 const picks=state.draft[`${side}Picks`],key=productionKey(state);
 const snapshot={key,picks:[...picks],locked:state.draft.locked,choosing:state.draft.activeTeam===side&&selecting(state.draft.action)};
 const previous=useRef(snapshot),serial=useRef(0),[queue,setQueue]=useState<Reveal[]>([]);
 useEffect(()=>{
  const old=previous.current;previous.current=snapshot;
  if(old.key!==key||old.picks.some((id,i)=>id&&picks[i]!==id)){setQueue([]);return;}
  const added=picks.flatMap((id,index)=>id&&!old.picks[index]?[{id,index}]:[]);
  if(old.locked||!old.choosing||!added.length||added.length>2)return;
  const priorActive=Array.from({length:5},(_,i)=>i).find(i=>!old.picks[i]);
  setQueue(items=>[...items,...added.map(({id,index})=>({token:++serial.current,id,index,...bounds(index,priorActive)}))]);
 },[key,JSON.stringify(picks),state.draft.locked,state.draft.activeTeam,state.draft.action]);
 const current=queue[0];
 useEffect(()=>{if(!current)return;const timer=window.setTimeout(()=>setQueue(items=>items.filter(item=>item.token!==current.token)),3000);return()=>window.clearTimeout(timer);},[current?.token]);
 if(!current)return null;
 const target=bounds(current.index,activeIndex);
 return <div key={current.token} className="draft-lock-reveal" data-champion={current.id} aria-hidden="true" style={{'--reveal-from-left':`${current.left}%`,'--reveal-from-width':`${current.width}%`,'--reveal-to-left':`${target.left}%`,'--reveal-to-width':`${target.width}%`} as CSSProperties}>
  <ChampionImage champions={champions} id={current.id} kind="splash" art="draftReveal"/>
 </div>;
}
