import type { Player } from '../shared/types';
import type { ReplayMoment } from '../shared/replay-director';
import type { Combatant, CombatReview, DamageFlow } from '../shared/combat-review';
import type { DamageEvent, ReplayDamageIndex } from './replay-damage';

function range(events:DamageEvent[],from:number,to:number) {
  let low=0,high=events.length;while(low<high){const mid=(low+high)>>>1;if(events[mid].time<from)low=mid+1;else high=mid;}
  const result:DamageEvent[]=[];for(let i=low;i<events.length&&events[i].time<=to;i++)if(events[i].amount>0)result.push(events[i]);return result;
}
export function buildCombatReview(index:ReplayDamageIndex,options:{session:string;time:number;from:number;until:number;players:Player[];moments:ReplayMoment[];units:Map<number,string>;now?:number}):CombatReview {
  const {session,time,players,moments,units}=options,from=Math.max(0,options.from),until=Math.min(time,options.until,index.duration),now=options.now??Date.now();
  const roster=new Map<number,Combatant>(index.heroes.map(h=>{const matches=players.filter(p=>p.team===h.team&&p.championId.toLowerCase()===h.champion.toLowerCase());return [h.networkId,{id:h.networkId,champion:h.champion,team:h.team,name:matches.length===1?matches[0].name:h.champion,playerId:matches.length===1?matches[0].id:undefined}];}));
  const unit=(id:number):Combatant=>roster.get(id)??{id,champion:'',name:`单位 #${id}`};
  const complete=(a:number,b:number)=>a>=from&&b<=until&&b>=a;
  const flows=new Map<string,DamageFlow>(),flowFrom=Math.max(0,time-15);
  for(const e of range(index.damageEvents,Math.max(from,flowFrom),until)){
    const source=roster.get(e.source),target=roster.get(e.target);if(!source||!target||source.team===target.team)continue;
    const key=`${e.source}:${e.target}`,row=flows.get(key)??{source,target,total:0,physical:0,magic:0,trueDamage:0};
    row.total+=e.amount;row[e.type===0?'physical':e.type===1?'magic':'trueDamage']+=e.amount;flows.set(key,row);
  }
  const deaths:CombatReview['deaths']=[],lastDeaths=new Map<string,number>();
  for(const moment of moments.filter(m=>m.kind==='kill'&&m.time<=until).sort((a,b)=>a.time-b.time)){
    if(!moment.victim)continue;const victims=[...roster.values()].filter(h=>moment.victimId!==undefined?h.id===moment.victimId:h.champion===moment.victim);if(victims.length!==1)continue;
    const victim=victims[0],start=Math.max(0,moment.time-12,(lastDeaths.get(String(victim.id))??-1)+.001);lastDeaths.set(String(victim.id),moment.time);
    const sources=new Map<number,DeathReviewSource>();
    for(const e of range(index.damageEvents,Math.max(start,from),moment.time)){if(e.target!==victim.id)continue;const row=sources.get(e.source)??{source:unit(e.source),total:0,physical:0,magic:0,trueDamage:0};row.total+=e.amount;row[e.type===0?'physical':e.type===1?'magic':'trueDamage']+=e.amount;sources.set(e.source,row);}
    deaths.push({id:`${session}:${moment.id}`,time:moment.time,from:start,victim,complete:complete(start,moment.time),sources:[...sources.values()].sort((a,b)=>b.total-a.total)});
  }
  const fights:CombatReview['fights']=moments.filter(m=>m.kind==='teamfight'&&m.end<=until).slice(-30).map(m=>{
    const start=m.time,end=Math.min(m.end,until),unambiguous=m.participants.every(name=>index.heroes.filter(h=>h.champion===name).length===1),ids=m.participantIds??(unambiguous?index.heroes.filter(h=>m.participants.includes(h.champion)).map(h=>h.networkId):[]),participants=new Set(ids),covered=complete(start,end)&&participants.size>=5&&ids.every(id=>roster.has(id));
    const hits=range(index.damageEvents,start,end).filter(e=>participants.has(e.source)&&participants.has(e.target)&&roster.get(e.source)?.team!==roster.get(e.target)?.team);
    const totals=new Map<number,number>();for(const e of hits)totals.set(e.source,(totals.get(e.source)??0)+e.amount);
    const rows=[...roster.values()].map(player=>({player,damage:covered?totals.get(player.id)??0:null})),samples:CombatReview['fights'][number]['samples']=[];
    const step=Math.max(1,Math.ceil((end-start)/120));let cursor=0,blue=0,red=0;
    for(let t=start;t<end+step;t+=step){const at=Math.min(t,end);while(cursor<hits.length&&hits[cursor].time<=at){const e=hits[cursor++];if(roster.get(e.source)?.team==='blue')blue+=e.amount;else red+=e.amount;}samples.push({time:at,blue:covered?blue:null,red:covered?red:null});if(at===end)break;}
    return {id:`${session}:${m.id}`,start,end,complete:covered,participants:m.participants,rows,samples};
  });
  const targets=new Map<number,Map<number,number>>(),objectiveFrom=Math.max(0,time-5);
  for(const e of range(index.damageEvents,Math.max(from,objectiveFrom),until)){if(!units.has(e.target)||!roster.has(e.source))continue;const values=targets.get(e.target)??new Map<number,number>();values.set(e.source,(values.get(e.source)??0)+e.amount);targets.set(e.target,values);}
  const objectives=[...targets].map(([id,values])=>{const covered=complete(objectiveFrom,time),seconds=time-objectiveFrom,rows=[...values].map(([source,damage])=>({player:unit(source),damage,dps:covered&&seconds>0?damage/seconds:null})).sort((a,b)=>b.damage-a.damage),total=rows.reduce((sum,r)=>sum+r.damage,0);return {id,kind:units.get(id)!,from:objectiveFrom,until,complete:covered,total,dps:covered&&seconds>0?total/seconds:null,rows};});
  return {session,gameTime:time,sampledAt:new Date(now).toISOString(),validForMs:5000,coverageFrom:from,coverageUntil:until,flowFrom,flowComplete:complete(flowFrom,time),flows:[...flows.values()].sort((a,b)=>b.total-a.total),deaths:deaths.slice(-30),fights,objectives};
}
type DeathReviewSource=CombatReview['deaths'][number]['sources'][number];
