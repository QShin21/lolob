import type {BroadcastState} from '../shared/types';
import type {ReplayDamageIndex} from './replay-damage';

export interface PlaybackReading {time:number;speed:number;paused:boolean;seeking?:boolean}
export interface PlaybackMark {value:PlaybackReading;at:number}
/** A sample must belong to one continuous playback interval, including external game controls. */
export function coherentPlayback(before:PlaybackMark,after:PlaybackMark,time:number):boolean {
  const a=before.value,b=after.value;
  if(a.seeking||b.seeking||a.paused!==b.paused||a.speed!==b.speed)return false;
  const elapsed=Math.max(0,after.at-before.at)/1000;
  const expected=a.time+(a.paused?0:elapsed*a.speed);
  if(b.time<a.time-.1||Math.abs(b.time-expected)>Math.max(.5,a.speed*.15))return false;
  return Number.isFinite(time)&&time>=a.time-.25&&time<=b.time+.25;
}

type Frame=Pick<BroadcastState,'gameTime'|'players'|'stats'|'neutralObjectives'>;
/** Runtime history: half-second game-time buckets, bounded and isolated by source session.
 * Only actual confirmed samples are stored; skipped accelerated frames are never fabricated. */
export class ReplaySampleHistory {
  private session='';
  private frames=new Map<number,Frame>();
  constructor(private limit=14400){}
  record(session:string,frame:Frame){
    if(session!==this.session){this.frames.clear();this.session=session;}
    const bucket=Math.floor(frame.gameTime*2);
    this.frames.set(bucket,structuredClone(frame));
    if(this.frames.size>this.limit)this.frames.delete(this.frames.keys().next().value!);
  }
  at(time:number):Frame|undefined {
    const frame=this.frames.get(Math.floor(time*2));
    return frame&&frame.gameTime<=time?structuredClone(frame):undefined;
  }
  economy(time:number):BroadcastState['economy'] {
    const buckets=new Map<number,BroadcastState['economy'][number]>();
    for(const f of this.frames.values()){
      if(f.gameTime>time||f.stats.blue.gold===null||f.stats.red.gold===null)continue;
      const bucket=Math.floor(f.gameTime/5),prior=buckets.get(bucket);
      if(!prior||prior.time<f.gameTime)buckets.set(bucket,{time:f.gameTime,blue:f.stats.blue.gold,red:f.stats.red.gold,
        source:f.players.every(p=>p.goldSource==='memory')?'memory':'api'});
    }
    return [...buckets.values()].sort((a,b)=>a.time-b.time).slice(-2000);
  }
}

/** An asynchronously loaded packet index can recover the exact entry baseline. */
export function recoverFightBaseline(state:BroadcastState,index:ReplayDamageIndex,from=0,until=Infinity){
  const segment=state.fightSegment,clock=state.gameClock;
  if(!segment?.active||clock?.awaitingLiveSample||segment.clockSession!==clock?.sessionId||segment.discontinuity!==clock?.discontinuity||segment.startedAt<from||segment.startedAt>until)return;
  for(const p of state.players){
    const row=segment.players[p.id];
    if(!row||row.baseline!==undefined||row.championId!==p.championId||p.telemetryDamageSource!=='packets'||!p.telemetryDamageSession)continue;
    const hero=index.heroes.find(h=>h.champion===p.championId&&h.team===p.team);
    const baseline=hero?index.at(hero.networkId,segment.startedAt)?.toChampions:undefined;
    if(baseline===undefined)continue;
    Object.assign(row,{baseline,previous:baseline,damageSession:p.telemetryDamageSession,invalid:false});
  }
}
