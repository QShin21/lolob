import type {BroadcastState,Champion} from '../shared/types';
import {currentGameResult} from '../shared/game-results';
import {sourceGameId,syncResultRecording,terminalComplete} from './game-results';
import {normalizeDamage} from './telemetry-normalize';
/** Enrich only an identified archived game and a unique same-side champion. */
export function enrichPostgame(state:BroadcastState,data:any,champions:Champion[],resultId?:string) {
 const result=resultId?state.gameResults?.find(r=>r.id===resultId):currentGameResult(state),id=sourceGameId(data?.gameId);
 if(Array.isArray(data?.participants)&&Array.isArray(data?.teams))data={...data,teams:data.teams.map((t:any)=>({...t,players:data.participants.filter((p:any)=>p.teamId===t.teamId)}))};
 if(!result||!id||result.sourceGameId!==id||!Array.isArray(data.teams))return;
 const completePlayers=new Set<string>();
 const duration=data.gameDuration??data.gameLength;if(typeof duration==='number'&&Number.isFinite(duration)&&duration>result.snapshot.duration&&duration<86400){result.snapshot.duration=duration;result.snapshot.sourceGameTime=duration;}
 const number=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
 for(const team of data.teams){const side=team.teamId===100?'blue':team.teamId===200?'red':undefined;if(!side||!Array.isArray(team.players))continue;
 for(const raw of team.players){const champion=champions.find(c=>c.key===Number(raw.championId));if(!champion)continue;
 const matches=result.snapshot.players.filter(p=>p.team===side&&p.championId===champion.id);if(matches.length!==1||team.players.filter((p:any)=>p.championId===raw.championId).length!==1)continue;
 const p=matches[0],stats=raw.stats??{};
 const fields=[['kills','CHAMPIONS_KILLED','kills'],['deaths','NUM_DEATHS','deaths'],['assists','ASSISTS','assists'],['level','LEVEL','champLevel'],['gold','GOLD_EARNED','goldEarned'],['visionScore','VISION_SCORE','visionScore']]as const;
 for(const [field,upper,lower]of fields){const value=stats[upper]??stats[lower];if(number(value))p[field]=value;}
 const lane=stats.MINIONS_KILLED??stats.totalMinionsKilled,neutral=stats.NEUTRAL_MINIONS_KILLED??stats.neutralMinionsKilled;
 if(number(lane)&&number(neutral))p.cs=lane+neutral;
 const kda=[stats.CHAMPIONS_KILLED??stats.kills,stats.NUM_DEATHS??stats.deaths,stats.ASSISTS??stats.assists];
 if(kda.every(number)&&number(lane)&&number(neutral)){p.statsAvailable=true;p.statsSource='api';p.statsGameTime=result.snapshot.duration;p.statsSampledAt=new Date().toISOString();}
 if(number(stats.GOLD_EARNED??stats.goldEarned)){p.goldSource='api';p.goldGameTime=result.snapshot.duration;p.goldSampledAt=new Date().toISOString();}
 if(kda.every(number)&&number(lane)&&number(neutral)&&number(stats.GOLD_EARNED??stats.goldEarned))completePlayers.add(p.id);
 const items=Array.from({length:7},(_,i)=>stats[`ITEM${i}`]??stats[`item${i}`]);if(items.every(number)){p.items=items.filter(i=>i>0);p.itemSlots=items;}

 for(const [key,source]of [['damageDealt','TOTAL_DAMAGE_DEALT_TO_CHAMPIONS'],['damageTaken','TOTAL_DAMAGE_TAKEN']]as const){const value=stats[source]??stats[key==='damageDealt'?'totalDamageDealtToChampions':'totalDamageTaken'];if(number(value))p[key]=value;}
 const damage=normalizeDamage({toChampions:p.damageDealt,taken:p.damageTaken,
   physicalToChampions:stats.PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS??stats.physicalDamageDealtToChampions,
   magicToChampions:stats.MAGIC_DAMAGE_DEALT_TO_CHAMPIONS??stats.magicDamageDealtToChampions,
   trueToChampions:stats.TRUE_DAMAGE_DEALT_TO_CHAMPIONS??stats.trueDamageDealtToChampions});
 if(damage){p.telemetryDamage={...damage};p.telemetryDamageSource='postgame';delete p.telemetryDamageSession;delete p.telemetryDamageSince;}
 }
 }
 for(const side of ['blue','red']as const){const players=result.snapshot.players.filter(p=>p.team===side);if(players.length===5&&players.every(p=>p.statsAvailable!==false))result.snapshot.stats[side].kills=players.reduce((sum,p)=>sum+p.kills,0);if(players.length===5&&players.every(p=>p.gold!==null))result.snapshot.stats[side].gold=players.reduce((sum,p)=>sum+(p.gold??0),0);}
 if(completePlayers.size===10&&terminalComplete(result.snapshot.players)){result.terminalSampleComplete=true;result.terminalSampleAccepted=true;result.snapshot.observedAt=new Date().toISOString();}
 syncResultRecording(state,result);
}
