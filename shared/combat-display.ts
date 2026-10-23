import type { BroadcastState, Player } from './types';
import { productionKey } from './production';
import { telemetryFresh } from './player-telemetry';

export interface FightPlayer { championId: string; baseline?: number; previous?: number; total?: number; sampledAt?: string; invalid?: boolean; damageSession?: string }
export interface FightSegment {
  id: string; key: string; active: boolean; startedAt: number; endedAt?: number;
  clockSession?: string; discontinuity?: number; lastTime: number;
  players: Record<string, FightPlayer>;
  /** Team cumulative damage sampled on game time; null marks unavailable telemetry. */
  samples?: { time: number; blue: number | null; red: number | null }[];
}
export type NeutralKind = 'grubs' | 'herald' | 'baron' | 'dragon' | 'elder';
export interface NeutralObjective { kind: NeutralKind; element?: string; state: 'alive' | 'countdown' | 'unknown'; dueAt?: number }
export interface NeutralSample { gameTime: number; sampledAt: string; validForMs: number; profile: string; objectives: NeutralObjective[] }

export function liveDamage(player: Player, state: BroadcastState, now = Date.now()): number | undefined {
  const value=player.telemetryDamage?.toChampions;
  return state.connections.live.status==='connected'&&!state.gameClock?.awaitingLiveSample&&
    player.telemetryDamageSource!=='postgame'&&telemetryFresh(player.telemetry,state.gameTime,now)&&
    typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
}
/** One server-owned interval, shared by preview, program and reconnecting browsers. */
export function syncFightSegment(state: BroadcastState, now=Date.now()): void {
  const key=productionKey(state),clock=state.gameClock;
  let segment=state.fightSegment;
  const onAir=(!state.production?.program||state.production.program.key===key)&&state.programScene==='teamfight'&&state.phase==='live'&&!state.production?.playingClipId;
  if(segment&&segment.key!==key){delete state.fightSegment;segment=undefined;}
  if(!onAir){if(segment?.active){segment.active=false;segment.endedAt=state.gameTime;}return;}
  // A seek starts a new interval when its first coherent frame arrives. While loading,
  // keep damage unavailable so an old baseline cannot be subtracted from a new position.
  if(clock?.awaitingLiveSample){if(segment){segment.active=false;for(const row of Object.values(segment.players))row.total=undefined;}return;}
  if(segment?.active&&(state.gameTime<segment.lastTime-.5||clock?.sessionId!==segment.clockSession||clock?.discontinuity!==segment.discontinuity)){
    segment.active=false;
  }
  if(!segment?.active){
    segment={id:`${now}:${state.revision}`,key,active:true,startedAt:state.gameTime,lastTime:state.gameTime,
      clockSession:clock?.sessionId,discontinuity:clock?.discontinuity,players:{}};
    for(const player of state.players){const baseline=liveDamage(player,state,now);segment.players[player.id]={championId:player.championId,baseline,previous:baseline,total:baseline===undefined?undefined:0,damageSession:player.telemetryDamageSession};}
    state.fightSegment=segment;
  }
  const discontinuity=state.gameTime<segment.lastTime-.5||clock?.sessionId!==segment.clockSession||clock?.discontinuity!==segment.discontinuity;
  for(const player of state.players){
    const row=segment.players[player.id];if(!row)continue;
    if(discontinuity||row.championId!==player.championId||row.damageSession!==player.telemetryDamageSession||
      player.telemetryDamageSince!==undefined&&player.telemetryDamageSince>segment.startedAt)row.invalid=true;
    const value=liveDamage(player,state,now);
    if(row.invalid||row.baseline===undefined||value===undefined){row.total=undefined;continue;}
    if(value<row.baseline||row.previous!==undefined&&value<row.previous){row.invalid=true;row.total=undefined;continue;}
    row.previous=value;row.total=Math.floor(value-row.baseline);row.sampledAt=player.telemetry!.sampledAt;
  }
  segment.lastTime=state.gameTime;
  const samples=segment.samples??(segment.samples=[]),last=samples.at(-1);
  if(!last||state.gameTime-last.time>=1){
    const total=(side:'blue'|'red')=>{
      const roster=state.players.filter(p=>p.team===side),values=roster.map(p=>segment!.players[p.id]?.total);
      return roster.length===5&&values.every(v=>v!==undefined&&Number.isFinite(v))?values.reduce<number>((sum,v)=>sum+v!,0):null;
    };
    samples.push({time:state.gameTime,blue:total('blue'),red:total('red')});
    if(samples.length>7200)samples.splice(0,samples.length-7200);
  }
}
