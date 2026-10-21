import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpectatorOcrWorker } from './spectator-ocr-worker';
import { nonnegative, object } from './telemetry-normalize';
import { ReplayDamageTelemetry } from './replay-damage-telemetry';
import { LiveDamageStream } from './live-damage-stream';
import { liveChampionId } from '../shared/champion-identity';
import { selectedRuneIds } from '../shared/lineup-runes';
import { ReplayDirector } from './replay-director';
import {recoverFightBaseline} from './replay-sampling';
import type {BroadcastState} from '../shared/types';

type Json = Record<string, any>;
export interface ObserverStatus { status: 'connected' | 'unavailable'; detail: string; profile?: string; sampledAt?: string }
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/observer-telemetry-worker.ps1');
// Cumulative Summoner's Rift XP thresholds, with the current level checked against the game sample.
const thresholds = [0,280,660,1140,1720,2400,3180,4060,5040,6120,7300,8580,9960,11440,13020,14700,16480,18360,20340,22420,24600];
const energy = new Set(['Akali','Ambessa','Kennen','LeeSin','Shen','Zed']);
const otherResource = new Set(['Aatrox','Belveth','Briar','DrMundo','Garen','Gnar','Katarina','Kled','Mordekaiser','RekSai','Renekton','Rengar','Riven','Rumble','Sett','Shyvana','Tryndamere','Viego','Vladimir','Yasuo','Yone','Zac']);
const key = (champion: string, team: string) => `${team}:${champion.toLowerCase()}`;

/** Do not attach a slot timer across a purchase, sale or inventory rearrangement. */
export function invalidateChangedItemSlots(before:Json,after:Json,sample:Json):void {
  const identity=(p:Json)=>key(liveChampionId(p.rawChampionName),p.team==='ORDER'?'blue':p.team==='CHAOS'?'red':'');
  const old=new Map<string,Json>((before.allPlayers??[]).map((p:Json)=>[identity(p),p]));
  const current=new Map<string,Json>((after.allPlayers??[]).map((p:Json)=>[identity(p),p]));
  const item=(p:Json|undefined,slot:number)=>p?.items?.find((i:Json)=>i.slot===slot)?.itemID??0;
  for(const p of sample.players??[])for(let slot=0;slot<=6;slot++){
    const id=key(p.champion,p.team),a=old.get(id),b=current.get(id);
    if(!a||!b||item(a,slot)!==item(b,slot))p.spells[6+slot]={state:'unknown'};
  }
}

/** Join by the API's champion and side, never object ordering or the displayed player name. */
export function mergeObserverTelemetry(data: Json, sample: Json, now = Date.now()): boolean {
  if (!sample.ok || !Array.isArray(sample.players) || sample.players.length !== 10 || !Array.isArray(data.allPlayers) || data.allPlayers.length !== 10 ||
      !nonnegative(sample.gameTime) || !nonnegative(data.gameData?.gameTime) || Math.abs(sample.gameTime-data.gameData.gameTime)>2 ||
      !Number.isFinite(Date.parse(sample.sampledAt)) || now-Date.parse(sample.sampledAt)>3000 || now-Date.parse(sample.sampledAt)<-1000) return false;
  const index=new Map<string,Json>();
  for(const p of sample.players) {
    if(!object(p)||typeof p.champion!=='string'||!['blue','red'].includes(p.team)||!Array.isArray(p.spells)||p.spells.length!==13)return false;
    const id=key(p.champion,p.team);if(index.has(id))return false;index.set(id,p);
  }
  const pairs: {api:Json;memory:Json}[]=[];
  for(const api of data.allPlayers) {
    const champion=liveChampionId(api.rawChampionName);
    const side=api.team==='ORDER'?'blue':api.team==='CHAOS'?'red':'';
    const memory=index.get(key(champion,side));
    if(!memory||api.level!==memory.level)return false;
    if(object(memory.scores)&&['kills','deaths','assists','creepScore'].every(k=>Number.isInteger(memory.scores[k])&&memory.scores[k]>=0)&&
      (!['kills','deaths','assists'].every(k=>memory.scores[k]===api.scores?.[k])||
       memory.scores.creepScore!==api.scores?.creepScore&&Math.floor(memory.scores.creepScore/10)*10!==api.scores?.creepScore))return false;
    pairs.push({api,memory});index.delete(key(champion,side));
  }
  data._observerProfile=sample.profile;
  if(object(sample.objectiveCounts))data._observerCounts={values:sample.objectiveCounts,sampledAt:sample.sampledAt,gameTime:sample.gameTime};
  if(Array.isArray(sample.neutralObjectives))data._observerObjectives={gameTime:sample.gameTime,sampledAt:sample.sampledAt,validForMs:3000,profile:sample.profile,objectives:sample.neutralObjectives};
  for(const {api,memory:m} of pairs) {
    const stamp={source:'memory',gameTime:sample.gameTime,sampledAt:sample.sampledAt,validForMs:3000};
    Object.assign(api,{health:m.health,maxHealth:m.maxHealth,resource:m.resource,maxResource:m.maxResource,
      resourceType:energy.has(m.champion)?'ENERGY':otherResource.has(m.champion)?'OTHER':'MANA',
      totalGold:m.totalGold,currentGold:m.currentGold,ultimate:m.spells[3],_observerStamp:stamp});
    if(object(m.scores)&&['kills','deaths','assists','creepScore'].every(k=>Number.isInteger(m.scores[k])&&m.scores[k]>=0)&&
      ['kills','deaths','assists'].every(k=>m.scores[k]===api.scores?.[k])&&
      (m.scores.creepScore===api.scores?.creepScore||Math.floor(m.scores.creepScore/10)*10===api.scores?.creepScore)){
      api.scores={...api.scores,...m.scores};api._observerScores=true;
    }
    if(nonnegative(m.visionScore)){api.visionScore=m.visionScore;api._observerVision=true;}
    if(object(m.buffs))api.buffs=m.buffs;
    const runeIds=selectedRuneIds(m.fullRunes);
    if(runeIds&&runeIds[0]===api.runes?.keystone?.id&&
      m.fullRunes.primaryRuneTree?.id===api.runes?.primaryRuneTree?.id&&
      m.fullRunes.secondaryRuneTree?.id===api.runes?.secondaryRuneTree?.id)api.fullRunes=m.fullRunes;
    if(object(m.damageStats)){
      api.damageStats=m.damageStats;
      if(m.damageStatsSource==='packets'){api._damageStatsSource='packets';api._damageStatsSession=m.damageStatsSession;api._damageStatsSince=m.damageStatsSince;}
    }
    const previous=thresholds[m.level-1],next=thresholds[m.level];
    if(nonnegative(m.experienceTotal)&&previous!==undefined&&next!==undefined&&m.experienceTotal>=previous&&m.experienceTotal<next)
      api.experienceData={current:m.experienceTotal,previousLevel:previous,nextLevel:next};
    if(object(api.summonerSpells))for(const [i,name] of ['summonerSpellOne','summonerSpellTwo'].entries())
      if(object(api.summonerSpells[name]))api.summonerSpells[name]={...api.summonerSpells[name],cooldown:m.spells[4+i]};
    if(Array.isArray(api.items))api.items=api.items.map((item:Json)=>({...item,...(Number.isInteger(item.slot)&&item.slot>=0&&item.slot<=6?{cooldown:m.spells[6+item.slot]}:{})}));
  }
  return true;
}

/** The sampler starts only with a complete spectator API roster and matching replay process. */
export class ObserverTelemetry {
  readonly director=new ReplayDirector();
  private worker?: SpectatorOcrWorker;
  private retryAt=0;
  private damage=new ReplayDamageTelemetry();
  private liveDamage=new LiveDamageStream();
  status:ObserverStatus={status:'unavailable',detail:'等待国服观战或回放'};
  constructor(private request:(port:number,route:string)=>Promise<any>){}
  recoverFight(state:BroadcastState){
    const replay=this.damage.timeline(),stream=this.liveDamage.timeline();
    if(replay&&state.players.every(p=>p.telemetryDamageSession?.startsWith('replay:')))recoverFightBaseline(state,replay);
    else if(stream&&state.players.every(p=>p.telemetryDamageSession&&!p.telemetryDamageSession.startsWith('replay:')))recoverFightBaseline(state,stream.index,stream.from,stream.until);
  }
  async enrich(data:Json,current:()=>boolean=()=>true):Promise<void> {
    if(process.platform!=='win32'||data.activePlayer?.summonerName||data.activePlayer?.riotId||!data.activePlayer?.error||data.allPlayers?.length!==10) {
      this.damage.reset();this.liveDamage.reset();this.director.reset();this.status={status:'unavailable',detail:'等待完整观战数据'};return;
    }
    if(Date.now()<this.retryAt)return;
    try {
      const game=await this.request(2999,'/replay/game');
      if(!Number.isInteger(game.processID)||game.processID<=0)throw Error('无法确认观战进程');
      this.worker??=new SpectatorOcrWorker({spawn:()=>spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:'pipe'}),timeoutMs:6000});
      const sample=await this.worker.request([]) as Json;
      if(!current())return;
      if(!sample.ok) {
        if(sample.reason==='sample-discontinuity'){data._observerIncoherent=true;throw Error('等待同一画面的完整遥测样本');}
        const detail=sample.reason==='unsupported-build'?`游戏 ${sample.version??''} 尚无匹配读取配置`:sample.reason==='access-unavailable'?'游戏未开放只读访问':`观战遥测暂不可用（${sample.reason??'读取失败'}）`;
        this.status={status:'unavailable',detail};this.retryAt=Date.now()+10000;return;
      }
      const after=await this.request(2999,'/liveclientdata/allgamedata');
      if(!current())return;
      if(after.activePlayer?.summonerName||after.activePlayer?.riotId||!after.activePlayer?.error||after.allPlayers?.length!==10)throw Error('等待同一画面的完整遥测样本');
      invalidateChangedItemSlots(data,after,sample);
      Object.assign(data,after);
      if(sample.pid!==game.processID)throw Error('等待同一画面的完整遥测样本');
      const replayDamage=this.damage.enrich(sample),streamDamage=this.liveDamage.enrich(sample);
      if(!mergeObserverTelemetry(data,sample)){data._observerIncoherent=true;throw Error('等待同一画面的完整遥测样本');}
      const stream=this.liveDamage.timeline();
      const streamMatches=stream&&sample.players.every((p:Json)=>stream.index.heroes.some(h=>h.networkId===p.networkId&&h.champion===p.champion&&h.team===p.team));
      this.director.observe(data,sample,replayDamage?this.damage.timeline():streamMatches?stream.index:undefined,streamMatches?stream:undefined);
      this.status={status:'connected',detail:'国服只读遥测已连接 · 冷却、生命、资源、经验、增益'+
        (replayDamage?' · 回放逐次伤害':streamDamage?' · 实时观战伤害':sample.replayPath?` · ${this.damage.detail}`:sample.observerSession?` · ${this.liveDamage.detail}`:''),profile:sample.profile,sampledAt:sample.sampledAt};
    } catch(error) {
      const transient=error instanceof Error&&error.message.startsWith('等待');
      this.status={status:'unavailable',detail:transient?error.message:'观战遥测暂不可用'};this.retryAt=transient?0:Date.now()+3000;
    }
  }
  async close(){this.damage.reset();this.liveDamage.reset();this.director.reset();await this.worker?.close();}
}
