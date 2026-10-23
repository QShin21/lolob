import { buildCombatReview } from './combat-review';
import type { Player } from '../shared/types';
import {randomUUID} from 'node:crypto';
import type {ReplayMoment,ReplayDirectorView} from '../shared/replay-director';
import type {DamageEvent,ReplayDamageIndex} from './replay-damage';
type Json=Record<string,any>;
const gap=8;
const objectiveNames:Record<string,string>={DragonKill:'巨龙',BaronKill:'男爵',HeraldKill:'峡谷先锋',HordeKill:'虚空巢虫',VoidGrubKill:'虚空巢虫',ElderDragonKill:'远古龙'};
const countNames:Record<string,string>={dragons:'巨龙',barons:'男爵',heralds:'峡谷先锋',voidgrubs:'虚空巢虫',elders:'远古龙'};
const objectiveKinds:Record<string,string>={DragonKill:'dragons',BaronKill:'barons',HeraldKill:'heralds',HordeKill:'voidgrubs',VoidGrubKill:'voidgrubs',ElderDragonKill:'elders'};

/** Seeking can replay the same notification with a new EventID and sub-second clock drift. */
function uniqueReplayEvents(events:Json[]):Json[]{
 const result:Json[]=[],last=new Map<string,number>();
 for(const e of [...events].sort((a,b)=>a.EventTime-b.EventTime)){
  const identity=JSON.stringify([e.EventName,e.KillerName??'',e.VictimName??'',e.DragonType??'',e.MonsterType??'',e.EventName==='ChampionKill'?null:e.EventID]);
  const previous=last.get(identity),tolerance=e.EventName==='ChampionKill'?1:.001;
  if(previous!==undefined&&e.EventTime-previous<=tolerance)continue;
  last.set(identity,e.EventTime);result.push(e);
 }
 return result;
}

/** Walk only the victim's current uninterrupted damage chain, bounded by its previous death. */
export function damageStart(events:DamageEvent[],target:number,time:number,previousDeath=0):number|undefined {
 let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].time<=time+.15)lo=mid+1;else hi=mid;}
 let start:number|undefined,next=time;
 for(let i=lo-1;i>=0;i--){const e=events[i];if(e.time<=previousDeath||next-e.time>(start===undefined?3:gap))break;if(e.target!==target||e.amount<=0)continue;
  if(next-e.time>(start===undefined?3:gap))break;start=e.time;next=e.time;
 }
 return start;
}

/** Connected combat episodes keep simultaneous, disjoint skirmishes separate. */
export function detectTeamfights(index:ReplayDamageIndex,until=index.duration):ReplayMoment[]{
 const heroes=new Map(index.heroes.map(h=>[h.networkId,h]));
 type Fight={id:string;start:number;end:number;firstSource:number;ids:Set<number>};const active:Fight[]=[],finished:Fight[]=[];
 for(const e of index.damageEvents){if(e.time>until)break;const a=heroes.get(e.source),b=heroes.get(e.target);if(!a||!b||a.team===b.team||e.amount<=0)continue;
  for(let i=active.length-1;i>=0;i--)if(e.time-active[i].end>gap)finished.push(...active.splice(i,1));
  const related=active.filter(f=>f.ids.has(e.source)||f.ids.has(e.target));
  const f=related.shift()??{id:`fight:${e.time.toFixed(3)}:${Math.min(e.source,e.target)}-${Math.max(e.source,e.target)}`,start:e.time,end:e.time,firstSource:e.source,ids:new Set<number>()};
  if(!active.includes(f))active.push(f);
  for(const other of related){if(other.start<f.start){f.start=other.start;f.id=other.id;f.firstSource=other.firstSource;}for(const id of other.ids)f.ids.add(id);active.splice(active.indexOf(other),1);}
  f.ids.add(e.source);f.ids.add(e.target);f.end=e.time;
 }
 finished.push(...active);
 return finished.filter(f=>{const blue=[...f.ids].filter(id=>heroes.get(id)!.team==='blue').length;return blue>=2&&f.ids.size-blue>=2&&f.ids.size>=5;}).map(f=>({
  id:f.id,kind:'teamfight',title:`团战 · ${f.ids.size} 人参战`,time:f.start,start:Math.max(0,f.start-5),end:f.end,basis:'damage',participantIds:[...f.ids],participants:[...f.ids].map(id=>heroes.get(id)!.champion),focus:{champion:heroes.get(f.firstSource)!.champion,name:heroes.get(f.firstSource)!.champion,reason:'participant'}
 }));
}

/** Private control-room index. Future replay events never enter the broadcast state. */
export class ReplayDirector {
 private key='';private session='';private pid=0;private at=0;private time=0;
 private previous?:{time:number;at:number;counts:Json};private observed=new Map<string,ReplayMoment>();
 private moments:ReplayMoment[]=[];private cachedIndex?:ReplayDamageIndex;private cachedEvents='';private source:ReplayDirectorView['source']='waiting';
 private from=0;private until=0;private units=new Map<number,string>();
 reset(){this.key='';this.session='';this.pid=0;this.at=0;this.previous=undefined;this.observed.clear();this.moments=[];this.cachedIndex=undefined;this.cachedEvents='';this.units.clear();this.source='waiting';}
 observe(data:Json,sample:Json,index:ReplayDamageIndex|undefined,coverage?:{from:number;until:number},now=Date.now()){
  const key=`${sample.pid}:${sample.processSession}`;
  if(key!==this.key){this.reset();this.key=key;this.session=randomUUID();this.pid=sample.pid;}
  this.at=now;this.time=sample.gameTime;this.source=sample.replayPath?'replay':'observer';this.from=coverage?.from??0;this.until=coverage?.until??index?.duration??sample.gameTime;
  for(const u of sample.neutralUnits??[])if(Number.isInteger(u.id)&&typeof u.kind==='string')this.units.set(u.id,u.kind);
  const counts=sample.objectiveCounts,previous=this.previous;
  if(counts&&previous&&sample.gameTime>=previous.time&&sample.gameTime-previous.time<=Math.max(2,(now-previous.at)/1000*8+1)){
   for(const side of ['blue','red'])for(const [kind,name] of Object.entries(countNames)){
    const before=previous.counts[side]?.[kind],after=counts[side]?.[kind];if(!Number.isInteger(before)||!Number.isInteger(after)||after<=before||after-before>3)continue;
    const candidates=new Map<number,DamageEvent>();
    for(const e of index?.damageEvents??[]){if(e.time>sample.gameTime+.15)break;if(e.time>=previous.time-.15&&this.units.get(e.target)===kind&&e.amount>0)candidates.set(e.target,e);}
    const last=[...candidates.values()].sort((a,b)=>b.time-a.time)[0];
    const eventTime=last?.time??sample.gameTime;
    const starts=index?[...candidates.values()].map(e=>damageStart(index.damageEvents,e.target,e.time)).filter((t):t is number=>t!==undefined):[];
    const start=starts.length?Math.min(...starts):undefined;
    const id=`objective:${side}:${kind}:${after}`;
    this.observed.set(id,{id,kind:'objective',objective:kind,title:`${side==='blue'?'蓝方':'红方'}击杀${name}${after-before>1?` ×${after-before}`:''}`,time:eventTime,start:Math.max(0,(start??eventTime)-3),end:eventTime,basis:start===undefined?'event':'damage',participants:[]});
    const killer=last&&index?.heroes.find(h=>h.networkId===last.source);if(killer)this.observed.get(id)!.focus={champion:killer.champion,name:killer.champion,reason:'killer'};
   }
  }
  this.previous=counts?{time:sample.gameTime,at:now,counts:structuredClone(counts)}:undefined;
  const raw=uniqueReplayEvents((Array.isArray(data.events?.Events)?data.events.Events:[]).filter((e:Json)=>Number.isFinite(e.EventTime)&&e.EventTime>=0&&(this.source==='replay'||e.EventTime<=sample.gameTime+.1)));
  const signature=JSON.stringify([raw,[...this.observed.values()],this.source==='observer'?Math.floor(sample.gameTime):0]);
  if(this.cachedIndex===index&&this.cachedEvents===signature)return;
  this.cachedIndex=index;this.cachedEvents=signature;
  const aliases=new Map<string,{id:number;champion:string}|null>(),names=new Map<string,string>();
  for(const p of data.allPlayers??[]){
   const m=sample.players.find((m:Json)=>p.team===(m.team==='blue'?'ORDER':'CHAOS')&&String(p.rawChampionName).toLowerCase().endsWith(m.champion.toLowerCase()));if(!m)continue;
   const name=p.riotIdGameName||p.summonerName||p.riotId;if(typeof name==='string')names.set(m.champion,name.replace(/#[^#]*$/,''));
   for(const value of [p.summonerName,p.riotId,p.riotIdGameName])if(typeof value==='string'&&value){
    for(const name of new Set([value,value.replace(/#[^#]*$/,'')])){
     const existing=aliases.get(name);
     aliases.set(name,existing===null||existing&&existing.id!==m.networkId?null:{id:m.networkId,champion:m.champion});
    }
   }
  }
  const deaths=new Map<number,number>(),events:ReplayMoment[]=[];
  const teams=new Map(index?.heroes.map(h=>[h.networkId,h.team]));
  const heroDamage=index?.damageEvents.filter(d=>teams.has(d.source)&&teams.has(d.target)&&teams.get(d.source)!==teams.get(d.target));
  for(const e of raw){
   if(e.EventName==='ChampionKill'){
    const victim=aliases.get(e.VictimName),killer=aliases.get(e.KillerName);
    const damage=heroDamage&&victim?damageStart(heroDamage,victim.id,e.EventTime,deaths.get(victim.id)):undefined;
    if(victim)deaths.set(victim.id,e.EventTime);
    events.push({id:`kill:${JSON.stringify([e.KillerName,e.VictimName,e.EventTime])}`,kind:'kill',title:`${e.KillerName||'野怪/防御塔'} → ${e.VictimName||'英雄'}`,time:e.EventTime,start:Math.max(0,(damage??e.EventTime)-3),end:e.EventTime,basis:damage===undefined?'event':'damage',victim:victim?.champion,victimId:victim?.id,participants:[killer?.champion,victim?.champion].filter((s):s is string=>!!s)});
    const target=killer??victim;if(target)events.at(-1)!.focus={champion:target.champion,name:names.get(target.champion)??target.champion,reason:killer?'killer':'victim'};
   }else if(objectiveNames[e.EventName]){
    events.push({id:`api:${e.EventID}:${e.EventTime}`,kind:'objective',objective:e.DragonType==='Elder'?'elders':objectiveKinds[e.EventName],title:`${e.KillerName||''} 击杀${e.DragonType==='Elder'?'远古龙':objectiveNames[e.EventName]}`,time:e.EventTime,start:Math.max(0,e.EventTime-3),end:e.EventTime,basis:'event',participants:[]});
    const killer=aliases.get(e.KillerName);if(killer)events.at(-1)!.focus={champion:killer.champion,name:names.get(killer.champion)??killer.champion,reason:'killer'};
   }
  }
  for(const e of this.observed.values()){
   const existing=events.find(v=>v.kind==='objective'&&v.objective===e.objective&&Math.abs(v.time-e.time)<4);
   if(!existing)events.push(e);else{if(e.basis==='damage'){existing.start=e.start;existing.basis='damage';}if(!existing.focus&&e.focus)existing.focus=e.focus;}
  }
  if(index)for(const fight of detectTeamfights(index,this.source==='replay'?index.duration:Math.min(sample.gameTime,this.until))){
   const kill=events.find(e=>e.kind==='kill'&&e.time>=fight.time&&e.time<=fight.end+2&&e.focus?.reason==='killer'&&fight.participants.includes(e.focus.champion));
   if(kill?.focus)fight.focus={...kill.focus};events.push(fight);
  }
  for(const e of events)if(e.focus)e.focus={...e.focus,name:names.get(e.focus.champion)??e.focus.name};
  this.moments=events.sort((a,b)=>a.time-b.time).slice(-2000);
 }
 snapshot(now=Date.now()):ReplayDirectorView {
  const connected=!!this.session&&now-this.at<6000;
  return {session:this.session,connected,source:this.source,coverageFrom:this.from,coverageUntil:this.until,moments:connected?this.moments:[],detail:!connected?'等待国服观战或回放连接':this.cachedIndex?(this.source==='replay'?'整场击杀与伤害已索引；资源事件由游戏事件及连续播放采样补充':'已采集观战片段；可回看时间以游戏缓冲为准'):'正在解析伤害，暂按事件前 3 秒定位'};
 }
 combatReview(players:Player[],time:number,now=Date.now()){if(!this.cachedIndex||!this.snapshot(now).connected||Math.abs(time-this.time)>2)return;return buildCombatReview(this.cachedIndex,{session:this.session,time,from:this.from,until:this.until,players,moments:this.moments,units:this.units,now});}
 processId(){return this.pid;}
}
