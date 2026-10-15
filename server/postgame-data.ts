import type {BroadcastState,Champion} from '../shared/types';
import {currentGameResult} from '../shared/game-results';
import {sourceGameId,syncResultRecording} from './game-results';
/** Enrich only an identified archived game and a unique same-side champion. */
export function enrichPostgame(state:BroadcastState,data:any,champions:Champion[]) {
 const result=currentGameResult(state),id=sourceGameId(data?.gameId);
 if(!result||!id||result.sourceGameId!==id||!Array.isArray(data.teams))return;
 const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
 for(const team of data.teams){const side=team.teamId===100?'blue':team.teamId===200?'red':undefined;if(!side||!Array.isArray(team.players))continue;
 for(const raw of team.players){const champion=champions.find(c=>c.key===Number(raw.championId));if(!champion)continue;
 const matches=result.snapshot.players.filter(p=>p.team===side&&p.championId===champion.id);if(matches.length!==1||team.players.filter((p:any)=>p.championId===raw.championId).length!==1)continue;
 const p=matches[0],stats=raw.stats??{};
 for(const [key,source]of [['damageDealt','TOTAL_DAMAGE_DEALT_TO_CHAMPIONS'],['damageTaken','TOTAL_DAMAGE_TAKEN']]as const){const value=stats[source]??stats[key==='damageDealt'?'totalDamageDealtToChampions':'totalDamageTaken'];if(number(value))p[key]=value;}
 }
 }
 syncResultRecording(state,result);
}
