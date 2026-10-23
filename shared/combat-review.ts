import type { BroadcastState, Player, Side } from './types';

export type CombatReviewMode = 'off' | 'damage-flow' | 'death-recap' | 'objective-dps' | 'fight-history';
export const combatReviewLabels: Record<CombatReviewMode, string> = { off:'收起逐次伤害分析', 'damage-flow':'伤害流向', 'death-recap':'死亡伤害回顾', 'objective-dps':'目标 DPS', 'fight-history':'历史团战' };
export interface Combatant { id:number; champion:string; team?:Side; name:string; playerId?:string }
export interface DamageFlow { source:Combatant; target:Combatant; total:number; physical:number; magic:number; trueDamage:number }
export interface DeathReview { id:string; time:number; from:number; victim:Combatant; complete:boolean; sources:{source:Combatant;total:number;physical:number;magic:number;trueDamage:number}[] }
export interface FightReview { id:string; start:number; end:number; complete:boolean; participants:string[]; rows:{player:Combatant;damage:number|null}[]; samples:{time:number;blue:number|null;red:number|null}[] }
export interface ObjectiveDamage { id:number; kind:string; from:number; until:number; complete:boolean; total:number; dps:number|null; rows:{player:Combatant;damage:number;dps:number|null}[] }
export interface CombatReview { session:string; gameTime:number; sampledAt:string; validForMs:number; coverageFrom:number; coverageUntil:number; flowFrom:number; flowComplete:boolean; flows:DamageFlow[]; deaths:DeathReview[]; fights:FightReview[]; objectives:ObjectiveDamage[] }
export function currentCombatReview(state:BroadcastState,now=Date.now()):CombatReview|undefined {
  const review=state.combatReview,age=now-Date.parse(review?.sampledAt??'');
  return review&&state.connections.live.status==='connected'&&!state.gameClock?.awaitingLiveSample&&Math.abs(review.gameTime-state.gameTime)<=2&&Number.isFinite(age)&&age>=-1000&&age<=review.validForMs?review:undefined;
}

/** Resolve display names through the roster held at TAKE, while preserving live damage values. */
export function combatReviewWithRoster(review:CombatReview,players:Player[]):CombatReview {
  const resolve=(unit:Combatant):Combatant=>{
    if(!unit.team||!unit.champion)return {...unit,name:`单位 #${unit.id}`};
    const matches=players.filter(p=>(unit.playerId?p.id===unit.playerId:true)&&p.team===unit.team&&p.championId.toLowerCase()===unit.champion.toLowerCase());
    return {...unit,name:matches.length===1?matches[0].name:unit.champion};
  };
  return {...review,
    flows:review.flows.map(row=>({...row,source:resolve(row.source),target:resolve(row.target)})),
    deaths:review.deaths.map(row=>({...row,victim:resolve(row.victim),sources:row.sources.map(source=>({...source,source:resolve(source.source)}))})),
    fights:review.fights.map(row=>({...row,rows:row.rows.map(value=>({...value,player:resolve(value.player)}))})),
    objectives:review.objectives.map(row=>({...row,rows:row.rows.map(value=>({...value,player:resolve(value.player)}))})),
  };
}
