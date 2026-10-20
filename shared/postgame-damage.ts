import type { Player } from './types';
export type ReportDamageKey = 'damageDealt' | 'damageTaken';
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
/** Official totals take precedence; full-match observed totals also work in frozen archives. */
export function reportDamage(player:Player|undefined,key:ReportDamageKey):number|undefined {
 if(!player)return;
 if(valid(player[key]))return player[key];
 if(player.telemetryDamageSource==='packets'&&(!valid(player.telemetryDamageSince)||player.telemetryDamageSince>1))return;
 const value=player.telemetryDamage?.[key==='damageDealt'?'toChampions':'taken'];
 return valid(value)?value:undefined;
}
export function damageShare(player:Player|undefined,players:Player[],key:ReportDamageKey):number|null {
 if(!player||players.length!==5||players.some(p=>p.team!==player.team)||!players.some(p=>p.id===player.id))return null;
 const values=players.map(p=>reportDamage(p,key)),value=reportDamage(player,key);
 if(value===undefined||values.some(v=>v===undefined))return null;
 const total=values.reduce<number>((sum,v)=>sum+v!,0);
 return total>0?Math.min(100,value/total*100):0;
}
