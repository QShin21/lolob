import { currentGameResult } from '../shared/game-results';
import { currentOcrMatch, defaultObjectiveRegions, hudObjectives, ocrMatchKey } from '../shared/hud-ocr';
import { ObjectiveCounterTracker, retainTeamGold, writableOcrMatch } from './hud-ocr';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import type { BroadcastState, EconomyFeed, EconomyOcrConfig, EconomyRoi, Player, PlayerEconomyFeed, ObjectiveOcrFeed } from '../shared/types';
import { record, ValidationError } from './state';
import { matchPlayerScoreboardRows, parseScoreboardRows, type PlayerGoldRow, type PlayerScoreboardRow } from './spectator-scoreboard';
import { prepareChampionPortraitManifest } from './spectator-portraits';
import { runPersistentSpectatorOcr, warmSpectatorOcrWorker } from './spectator-ocr-worker';

const ttl=10000;
const statsTtl=3000;
const probeInterval=500;
export const defaultEconomyConfig:EconomyOcrConfig={enabled:false,blue:{x:.33,y:0,width:.08,height:.06},red:{x:.59,y:0,width:.08,height:.06}};
export const defaultPlayerGoldRegion:EconomyRoi={x:0,y:.4,width:1,height:.6};
export function parseGold(value:unknown):number {
  if(typeof value==='number'){if(Number.isFinite(value)&&Number.isInteger(value)&&value>=0&&value<=1000000)return value;throw new ValidationError('经济数值需为 0–1000000 的整数');}
  if(typeof value!=='string'||value.length>40)throw new ValidationError('请输入双方比分板上的经济数值');
  const source=value.normalize('NFKC').trim().replace(/(?<=\d)\s*[·∙]\s*(?=\d)/g,'.').replace(/\s*([.,])\s*/g,'$1').replace(/(\d)\s+([kK万])$/,'$1$2');let result:number;
  if(/^\d+$/.test(source)||/^\d{1,3}(?:,\d{3})+$/.test(source))result=Number(source.replaceAll(',',''));
  else if(/^\d+(?:\.\d{1,3})?[kK]$/.test(source))result=Number(source.slice(0,-1))*1000;
  else if(/^\d+(?:\.\d{1,4})?万$/.test(source))result=Number(source.slice(0,-1))*10000;
  else throw new ValidationError('无法确认经济文字，请使用 23400、23,400、23.4k 或 2.34万，区域内仅保留经济数字');
  const rounded=Math.round(result);if(!Number.isFinite(result)||rounded<0||rounded>1000000||Math.abs(result-rounded)>1e-6)throw new ValidationError('经济数值超出允许范围');return rounded;
}
function validateRoi(input:unknown,topOnly=true):EconomyRoi {
  const value=record(input);const roi={}as EconomyRoi;
  for(const key of ['x','y','width','height']as const){const n=value[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1||((key==='width'||key==='height')&&n<=0))throw new ValidationError('识别区域需使用 0–1 范围内的坐标与正宽高');roi[key]=n;}
  if(roi.x+roi.width>1+1e-9||roi.y+roi.height>1+1e-9)throw new ValidationError('识别区域超出了游戏画面');if(topOnly&&roi.y+roi.height>.5)throw new ValidationError('团队经济识别区域需位于观战画面顶部');return roi;
}
export function validateEconomyConfig(input:unknown):EconomyOcrConfig {const value=record(input);if(typeof value.enabled!=='boolean')throw new ValidationError('经济识别开关需为布尔值');const blue=validateRoi(value.blue),red=validateRoi(value.red);if(Math.min(blue.x+blue.width,red.x+red.width)>Math.max(blue.x,red.x)&&Math.min(blue.y+blue.height,red.y+red.height)>Math.max(blue.y,red.y))throw new ValidationError('蓝红方经济识别区域不能重叠');const config:EconomyOcrConfig={enabled:value.enabled,blue,red};if(value.players!==undefined){const players=record(value.players);if(typeof players.enabled!=='boolean')throw new ValidationError('个人经济识别开关需为布尔值');const region=validateRoi(players.region,false);if(region.x>=.5||region.x+region.width<=.5||region.y<.4)throw new ValidationError('个人计分板区域需位于游戏下半部，并覆盖中线两侧');config.players={enabled:players.enabled,region};}
  if(value.objectives!==undefined){
    const objectives=record(value.objectives),regions=record(objectives.regions);
    if(typeof objectives.enabled!=='boolean')throw new ValidationError('资源识别开关需为布尔值');
    const boxes=structuredClone(defaultObjectiveRegions);
    for(const side of ['blue','red']as const){const source=record(regions[side]);for(const key of hudObjectives){boxes[side][key]=validateRoi(source[key]);if(boxes[side][key].y+boxes[side][key].height>.15)throw new ValidationError('资源数字区域需位于顶部 15% 内');}}
    const all=Object.values(boxes).flatMap(side=>Object.values(side));
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];if(Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y))throw new ValidationError('资源数字识别区域不能重叠');}
    config.objectives={enabled:objectives.enabled,regions:boxes};
  }
  return config;
}
export interface OcrReading {ok:boolean;blueText?:string;redText?:string;error?:string;playerWords?:unknown;playerPortraits?:unknown;playerError?:string;capturedAt?:number;capturedGameTime?:number;objectiveTexts?:unknown;objectiveError?:string}
export interface AutoLocatedReading extends OcrReading {blueRoi?:EconomyRoi;redRoi?:EconomyRoi}
async function runSpectatorOcr(args:string[]):Promise<AutoLocatedReading>{
  return runPersistentSpectatorOcr(args);
}
const playersEnabled=(config:EconomyOcrConfig)=>config.players?.enabled??config.enabled;
const objectivesEnabled=(config:EconomyOcrConfig)=>config.objectives?.enabled??config.enabled;
export async function readSpectatorGold(config:EconomyOcrConfig,players:Player[]=[],imagePath?:string,cancelled?:()=>boolean):Promise<OcrReading>{const args:string[]=imagePath?['-ImagePath',imagePath]:[];for(const [side,roi]of [['Blue',config.blue],['Red',config.red]]as const)for(const [field,value]of Object.entries(roi))args.push(`-${side}${field[0].toUpperCase()+field.slice(1)}`,String(value));if(!config.enabled)args.push('-SkipTeam');if(objectivesEnabled(config))args.push('-ObjectivesJson',JSON.stringify(config.objectives?.regions??defaultObjectiveRegions));if(playersEnabled(config)){args.push('-ReadPlayers');for(const [field,value]of Object.entries(config.players?.region??defaultPlayerGoldRegion))args.push(`-Players${field[0].toUpperCase()+field.slice(1)}`,String(value));const manifest=await prepareChampionPortraitManifest(players);if(manifest)args.push('-ChampionManifest',manifest);}if(cancelled?.())return {ok:false,error:'采样已关闭'};return runSpectatorOcr(args);}
export async function autoLocateSpectatorGold():Promise<AutoLocatedReading>{return runSpectatorOcr(['-AutoLocate']);}
type Sample={blue:number;red:number;at:number;gameTime:number;raw?:{blue:string;red:string}};
type PlayerSample={row:PlayerScoreboardRow;at:number;gameTime:number};
type PlayerGoldSample={row:PlayerGoldRow;at:number;gameTime:number};
type Options={now?:()=>number;capture?:(config:EconomyOcrConfig)=>Promise<OcrReading>;frame?:()=>Promise<Buffer>;locate?:()=>Promise<AutoLocatedReading>};
export class EconomyBridge {
  private closed=false;
  private objectiveTracker=new ObjectiveCounterTracker();private objectiveError='';
  private manual:Sample|undefined;private ocr:Sample|undefined;private api:Sample|undefined;private context='';private lastGameTime:number|undefined;private lastGameTimeAt:number|undefined;private generation=0;private pending=false;private nextProbe=0;private error='';
  private playerSamples=new Map<string,PlayerSample>();private playerError='';private playerSampledAt:number|undefined;
  private playerGoldSamples=new Map<string,PlayerGoldSample>();private probeDurationMs:number|undefined;
  private apiPlayers=new Map<string,Player>();private rosterIdentity='';
  private now:()=>number;private capture:(config:EconomyOcrConfig)=>Promise<OcrReading>;private locate:()=>Promise<AutoLocatedReading>;
  constructor(private get:()=>BroadcastState,private commit:(work:(s:BroadcastState)=>void)=>void,options:Options={}){this.now=options.now??Date.now;this.capture=options.capture??(async config=>{
    const sourceReady=()=>{const state=this.get(),live=state.connections.live,observedAt=Date.parse(live.updatedAt??'');return !state.gameClock?.awaitingLiveSample&&(!playersEnabled(config)||(live.status==='connected'&&Number.isFinite(observedAt)&&this.now()-observedAt<=Math.max(ttl,state.settings.pollInterval*3)&&observedAt<=this.now()+1000));};
    const unavailable={ok:false,error:'等待局内 API 确认当前游戏阵容',playerError:'局内数据未连接或已过期，等待当前游戏阵容后再读取个人计分板'};
    if(!sourceReady())return unavailable;
    await warmSpectatorOcrWorker();if(playersEnabled(config))await prepareChampionPortraitManifest(this.get().players);
    if(this.closed)throw new Error('采样已关闭');if(!sourceReady())return unavailable;
    const capturedAt=this.now(),capturedGameTime=this.get().gameTime;
    const frame=await options.frame?.();
    if(this.closed)throw new Error('采样已关闭');
    if(!frame){const at=this.now(),gameTime=this.get().gameTime;return {...await readSpectatorGold(config,this.get().players,undefined,()=>this.closed),capturedAt:at,capturedGameTime:gameTime};}
    const directory=await mkdtemp(path.join(os.tmpdir(),'riftcast-game-ocr-'));
    try{const imagePath=path.join(directory,'game.png');await writeFile(imagePath,frame);return {...await readSpectatorGold(config,this.get().players,imagePath,()=>this.closed),capturedAt,capturedGameTime};}finally{const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('riftcast-game-ocr-'))throw new Error('临时采样目录无效');await rm(target,{recursive:true,force:true});}
  });this.locate=options.locate??autoLocateSpectatorGold;this.syncContext();}
  private config():EconomyOcrConfig {try{return validateEconomyConfig(this.get().settings.economyOcr??defaultEconomyConfig);}catch{return structuredClone(defaultEconomyConfig);}}
  private clear(dropArchive=true){this.manual=undefined;this.ocr=undefined;this.api=undefined;this.error='';this.playerSamples.clear();this.playerGoldSamples.clear();this.playerError='';this.playerSampledAt=undefined;this.probeDurationMs=undefined;this.apiPlayers.clear();this.rosterIdentity='';this.objectiveTracker.clear();this.objectiveError='';this.generation++;if(dropArchive&&this.get().ocrMatch)this.commit(s=>{delete s.ocrMatch;});}
  private syncContext(gameTime?:number){
    const s=this.get(),next=ocrMatchKey(s);
    if(next!==this.context){const retained=currentOcrMatch(s);this.clear(this.context!==''||!retained);this.context=next;this.lastGameTime=undefined;
      if(retained&&currentOcrMatch(this.get())){const samples=[...Object.values(retained.players),...Object.values(retained.objectives.blue),...Object.values(retained.objectives.red),...(retained.teamGold?[retained.teamGold]:[])];this.lastGameTime=samples.length?Math.max(...samples.map(p=>p.gameTime)):undefined;this.lastGameTimeAt=samples.length?Math.max(...samples.map(p=>Date.parse(p.sampledAt))):undefined;}
    }
    if(s.ocrMatch?.sourceGameId&&s.activeSourceGameId&&s.ocrMatch.sourceGameId!==s.activeSourceGameId)this.clear();
    if(gameTime!==undefined){const allowance=Math.max(20,(this.now()-(this.lastGameTimeAt??this.now()))/1000*8+2);if(this.lastGameTime!==undefined&&(gameTime<this.lastGameTime-1||gameTime>this.lastGameTime+allowance))this.clear();this.lastGameTime=gameTime;this.lastGameTimeAt=this.now();}
  }
  observePlayers(players:Player[],gameTime:number):void {
    this.syncContext(gameTime);
    const identity=players.map(player=>[player.id,player.team,player.championId].join(':')).sort().join('|');
    if((this.rosterIdentity&&this.rosterIdentity!==identity)||(currentOcrMatch(this.get())?.roster&&currentOcrMatch(this.get())?.roster!==identity))this.clear();
    this.rosterIdentity=identity;this.apiPlayers=new Map(players.map(player=>[player.id,structuredClone(player)]));
  }
  resolvePlayers(players:Player[]):Player[]{
    if(this.get().mode!=='live')return structuredClone(players);
    const now=this.now();return players.flatMap(player=>{
      const baseline=this.apiPlayers.get(player.id);const sample=this.playerSamples.get(player.id);const goldSample=this.playerGoldSamples.get(player.id);
      const fresh=sample&&playersEnabled(this.config())&&now>=sample.at&&now-sample.at<=statsTtl;
      const freshGold=goldSample&&playersEnabled(this.config())&&now>=goldSample.at&&now-goldSample.at<=ttl;
      if(player.statsSource==='ocr'&&!baseline&&!fresh)return [];
      const result={...player};
      if(player.statsSource==='ocr'&&baseline){for(const key of ['kills','deaths','assists','cs','statsAvailable','statsSource','statsSampledAt','statsExpiresAt','statsGameTime']as const){const value=baseline[key];if(value===undefined)delete (result as unknown as Record<string,unknown>)[key];else (result as unknown as Record<string,unknown>)[key]=value;}}
      if(player.goldSource==='ocr'){result.gold=baseline?.gold??null;delete result.goldSource;delete result.goldSampledAt;delete result.goldExpiresAt;delete result.goldGameTime;if(baseline?.currentGold!==undefined)result.currentGold=baseline.currentGold;else delete result.currentGold;if(result.gold!==null){result.goldSampledAt=baseline?.goldSampledAt;result.goldGameTime=baseline?.goldGameTime;}}
      if(player.visionSource==='ocr'){
        if(baseline?.visionScore!==undefined){result.visionScore=baseline.visionScore;result.visionSource='api';}else{delete result.visionScore;delete result.visionSource;}
        delete result.visionSampledAt;delete result.visionExpiresAt;
      }
      if(fresh&&sample?.row.visionScore!==undefined)Object.assign(result,{visionScore:sample.row.visionScore,visionSource:'ocr',visionSampledAt:new Date(sample.at).toISOString(),visionExpiresAt:new Date(sample.at+statsTtl).toISOString()});
      if(result.gold!==null)result.goldSource=baseline?.goldSource==='memory'?'memory':'api';
      if(fresh&&sample)Object.assign(result,{statsAvailable:true,kills:sample.row.kills,deaths:sample.row.deaths,assists:sample.row.assists,cs:sample.row.cs,statsSource:'ocr',statsSampledAt:new Date(sample.at).toISOString(),statsGameTime:sample.gameTime,statsExpiresAt:new Date(sample.at+statsTtl).toISOString()});
      if(freshGold&&goldSample&&result.gold===null){result.gold=goldSample.row.totalGold;result.currentGold=goldSample.row.currentGold;result.goldSource='ocr';result.goldSampledAt=new Date(goldSample.at).toISOString();result.goldGameTime=goldSample.gameTime;result.goldExpiresAt=new Date(goldSample.at+ttl).toISOString();}
      return [result];
    });
  }
  playerStatus(input=this.get().players):PlayerEconomyFeed {
    const players=this.resolvePlayers(input),total=players.length,matched=players.filter(player=>player.gold!==null).length,statsMatched=players.filter(player=>player.statsSource==='ocr').length;
    const enabled=playersEnabled(this.config()),status=this.get().mode!=='live'?'disabled':matched===total&&statsMatched===total&&total>0?'fresh':matched>0||statsMatched>0?'partial':!enabled?'disabled':this.playerError?'error':this.playerSamples.size||this.playerGoldSamples.size?'stale':'waiting';
    const detail=status==='disabled'?'个人观战识别已关闭':matched>0||statsMatched>0?`计分板 KDA / 补刀 ${statsMatched}/${total}，视野 ${players.filter(player=>player.visionScore!==undefined).length}/${total}，累计经济 ${matched}/${total}；${matched===0?'装备视图可读取统计，显示金币列后再采集个人经济':'括号内为累计金币，括号外为当前余额'}`:
      this.playerError||(status==='stale'?'旧统计已超过 3 秒、旧经济已超过 10 秒，等待新的可见计分板':'显示原生底部计分板，等待英雄头像、KDA 和补刀；金币列可另行采集');
    return {status,detail,matched,statsMatched,total,intervalMs:probeInterval,...(this.probeDurationMs!==undefined?{durationMs:this.probeDurationMs}:{}),...(this.playerSampledAt!==undefined?{sampledAt:new Date(this.playerSampledAt).toISOString()}:{})};
  }
  private acceptPlayerReading(reading:OcrReading,at:number,gameTime:number){
    if(!playersEnabled(this.config()))return;
    const rows=parseScoreboardRows(reading.playerWords,reading.playerPortraits),matches=matchPlayerScoreboardRows(rows,this.get().players);
    let accepted=0;
    for(const [id,row]of matches){
      const previous=this.playerSamples.get(id),previousGold=this.playerGoldSamples.get(id);
      const forward=!previous||gameTime>=previous.gameTime;
      const nondecreasing=!previous||!forward||(['kills','deaths','assists','cs']as const).every(key=>row[key]>=previous.row[key]);
      if(nondecreasing){this.playerSamples.set(id,{row,at,gameTime});accepted++;}
      if(row.totalGold!==undefined&&row.currentGold!==undefined&&(!previousGold||gameTime<previousGold.gameTime||row.totalGold>=previousGold.row.totalGold))this.playerGoldSamples.set(id,{row:row as PlayerGoldRow,at,gameTime});
    }
    this.playerError=reading.playerError||(accepted?'':'未确认个人统计：请完整显示原生底部计分板的英雄头像、KDA 和黄色补刀');
    if(accepted)this.playerSampledAt=at;
    const gold=[...this.playerGoldSamples].filter(([,sample])=>sample.at===at&&sample.gameTime===gameTime);
    if(gold.length)this.commit(s=>{const data=writableOcrMatch(s);if(!data)return;if(this.rosterIdentity)data.roster=this.rosterIdentity;
      for(const [id,sample]of gold){const player=s.players.find(p=>p.id===id),previous=data.players[id];if(!player||previous&&(previous.value>sample.row.totalGold||previous.gameTime>gameTime))continue;data.players[id]={value:sample.row.totalGold,team:player.team,championId:player.championId,sampledAt:new Date(at).toISOString(),gameTime};}
    });
  }
  private acceptObjectiveReading(reading:OcrReading,at:number,gameTime:number){
    if(!objectivesEnabled(this.config()))return;
    const accepted=this.objectiveTracker.accept(reading.objectiveTexts,currentOcrMatch(this.get()),at,gameTime);
    this.objectiveError=reading.objectiveError||'';
    if(Object.values(accepted).some(side=>Object.keys(side).length))this.commit(s=>{const data=writableOcrMatch(s);if(!data)return;for(const side of ['blue','red']as const)Object.assign(data.objectives[side],accepted[side]);});
  }
  private objectiveStatus():ObjectiveOcrFeed {
    const data=currentOcrMatch(this.get()),samples=data?[...Object.values(data.objectives.blue),...Object.values(data.objectives.red)]:[],now=this.now();
    const fresh=samples.filter(p=>now>=Date.parse(p.sampledAt)&&now-Date.parse(p.sampledAt)<=ttl),enabled=this.get().mode==='live'&&objectivesEnabled(this.config());
    return {status:!enabled?'disabled':fresh.length===8?'fresh':fresh.length?'partial':samples.length?'stale':'waiting',matched:fresh.length,total:8,
      detail:!enabled?'顶部资源 OCR 已关闭':`顶部资源 ${fresh.length}/8 有效，${samples.length}/8 已留存；新计数需连续两帧一致。${this.objectiveError||'未读到的项目保持缺失，零值单独确认。'}`,
      ...(samples.length?{sampledAt:samples.map(p=>p.sampledAt).sort().at(-1)}:{})};
  }
  private playerTeamSample():Sample|undefined {
    const players=this.get().players;if(players.length!==10||!playersEnabled(this.config()))return;
    const samples=players.map(player=>({player,sample:this.playerGoldSamples.get(player.id)}));
    const at=samples[0]?.sample?.at;
    if(at===undefined||samples.some(({sample})=>!sample||sample.at!==at||this.now()<sample.at||this.now()-sample.at>ttl))return;
    if(['blue','red'].some(side=>players.filter(player=>player.team===side).length!==5))return;
    const total=(side:string)=>samples.filter(({player})=>player.team===side).reduce((sum,{sample})=>sum+sample!.row.totalGold,0);
    return {blue:total('blue'),red:total('red'),at,gameTime:samples[0].sample!.gameTime};
  }
  private feed():EconomyFeed {
    const now=this.now();const config=this.config();const playerTotal=this.playerTeamSample();const candidates=[['api',this.api],['manual',this.manual],['ocr',playerTotal],['ocr',this.ocr]]as const;
    const active=candidates.find(([,sample])=>sample&&now-sample.at<=ttl&&now>=sample.at);
    if(active){const [source,sample]=active;return {source,status:'fresh',detail:source==='api'?'游戏 API 的双方累计经济':source==='manual'?'人工校准 · 来自观战比分板的显示数值':sample===playerTotal?'观战 HUD 识别 · 同一画面十名选手累计金币合计':'观战 HUD 识别 · 来自可见比分板，保留显示精度',blue:sample!.blue,red:sample!.red,sampledAt:new Date(sample!.at).toISOString(),expiresAt:new Date(sample!.at+ttl).toISOString(),gameTime:sample!.gameTime,...(sample!.raw?{raw:sample!.raw}:{})};}
    const previous=candidates.find(([,sample])=>sample);
    if(previous){const [source,sample]=previous;return {source,status:'stale',detail:'经济采样已超过 10 秒，请刷新可见比分板数据',blue:null,red:null,sampledAt:new Date(sample!.at).toISOString(),expiresAt:new Date(sample!.at+ttl).toISOString(),...(sample!.raw?{raw:sample!.raw}:{})};}
    return {source:'none',status:this.error?'error':config.enabled?'waiting':'disabled',detail:this.error||(config.enabled?'等待可见观战画面与已校准的经济区域':'API 未提供累计经济，可手动校准或启用观战 HUD 识别'),blue:null,red:null};
  }
  status():EconomyFeed {this.syncContext();return structuredClone({...this.feed(),players:this.playerStatus(),objectives:this.objectiveStatus()});}
  private publish(feed:EconomyFeed){if(currentGameResult(this.get()))return;feed={...feed,players:this.playerStatus(),objectives:this.objectiveStatus()};const retained=this.playerTeamSample()??this.ocr;this.commit(s=>{
    if(retained&&this.now()>=retained.at&&this.now()-retained.at<=ttl){const data=writableOcrMatch(s);if(data)retainTeamGold(data,retained.blue,retained.red,retained.at,retained.gameTime);}
    s.economyFeed=structuredClone(feed);if(s.mode!=='live')return;s.players=this.resolvePlayers(s.players);for(const side of ['blue','red']as const)s.stats[side].kills=s.players.filter(player=>player.team===side).reduce((sum,player)=>sum+player.kills,0);if(feed.status==='fresh'&&feed.blue!==null&&feed.red!==null){s.stats.blue.gold=feed.blue;s.stats.red.gold=feed.red;const point={time:feed.gameTime??s.gameTime,blue:feed.blue,red:feed.red,source:feed.source};const previous=s.economy.at(-1);if(previous?.time===point.time)s.economy[s.economy.length-1]=point;else{s.economy=s.economy.filter(p=>p.time<point.time);s.economy.push(point);s.economy=s.economy.slice(-2000);}}else{s.stats.blue.gold=null;s.stats.red.gold=null;}});}
  configure(input:unknown):EconomyFeed {const config=validateEconomyConfig(input);this.ocr=undefined;this.error='';this.playerSamples.clear();this.playerGoldSamples.clear();this.playerError='';this.playerSampledAt=undefined;this.probeDurationMs=undefined;this.objectiveTracker.clear();this.objectiveError='';this.generation++;this.nextProbe=0;this.commit(s=>{s.settings.economyOcr=config;});const feed=this.status();this.publish(feed);return feed;}
  sample(input:unknown):EconomyFeed {const value=record(input);const blue=parseGold(value.blue),red=parseGold(value.red);this.syncContext(this.get().gameTime);if(this.get().mode!=='live')throw new ValidationError('请先切换真实数据模式，再校准观战经济');this.manual={blue,red,at:this.now(),gameTime:this.get().gameTime,raw:{blue:String(value.blue),red:String(value.red)}};this.error='';const feed=this.feed();this.publish(feed);return feed;}
  reset():void {this.clear();this.lastGameTime=undefined;this.commit(s=>{if(s.mode==='live')s.economy=[];});const feed=this.feed();this.publish(feed);}
  close():void {this.closed=true;this.generation++;}
  async autoCalibrate():Promise<{config:EconomyOcrConfig;feed:EconomyFeed}>{this.syncContext(this.get().gameTime);if(this.get().mode!=='live')throw new ValidationError('请先切换真实数据模式，再自动定位观战经济');if(this.pending)throw new ValidationError('经济识别正在进行，请稍后重试');this.pending=true;const generation=this.generation,at=this.now();try{const reading=await this.locate();this.syncContext(this.get().gameTime);if(generation!==this.generation)throw new ValidationError('比赛或回放位置已变化，请重新自动定位');if(!reading.ok)throw new ValidationError(reading.error||'未能明确定位双方经济，请显示原生顶部计分栏或手动校准');const config=validateEconomyConfig({enabled:true,blue:reading.blueRoi,red:reading.redRoi,...(this.config().players?{players:this.config().players}:{}),...(this.config().objectives?{objectives:this.config().objectives}:{})});if(config.blue.x+config.blue.width/2>=.5||config.red.x+config.red.width/2<=.5)throw new ValidationError('无法确认经济区域的蓝红方位置，请手动校准');const blue=parseGold(reading.blueText),red=parseGold(reading.redText);this.ocr={blue,red,at,gameTime:this.get().gameTime,raw:{blue:reading.blueText!,red:reading.redText!}};this.error='';this.generation++;this.nextProbe=this.now()+2000;this.commit(s=>{s.settings.economyOcr=config;});const feed=this.feed();this.publish(feed);return {config:structuredClone(config),feed};}finally{this.pending=false;}}
  resolve(gameTime:number,stats:BroadcastState['stats']):{stats:BroadcastState['stats'];feed:EconomyFeed}{this.syncContext(gameTime);const normalized=structuredClone(stats);if(stats.blue.gold!==null&&stats.red.gold!==null&&Number.isFinite(stats.blue.gold)&&Number.isFinite(stats.red.gold)){this.api={blue:stats.blue.gold,red:stats.red.gold,at:this.now(),gameTime};}else this.api=undefined;const feed={...this.feed(),objectives:this.objectiveStatus()};if(feed.status==='fresh'){normalized.blue.gold=feed.blue;normalized.red.gold=feed.red;}else{normalized.blue.gold=null;normalized.red.gold=null;}return {stats:normalized,feed};}
  async probe():Promise<EconomyFeed>{if(this.closed||currentGameResult(this.get())||this.get().awaitingNextGame||this.get().gameClock?.awaitingLiveSample)return this.status();this.syncContext(this.get().gameTime);const config=this.config();if(!config.enabled&&!playersEnabled(config)&&!objectivesEnabled(config)){this.error='请先启用并校准观战经济识别区域';const feed=this.status();this.publish(feed);return feed;}if(this.get().mode!=='live'){this.error='请先切换真实数据模式';const feed=this.status();this.publish(feed);return feed;}if(this.pending)return this.status();this.pending=true;const generation=this.generation;const at=this.now(),sampleGameTime=this.get().gameTime,sourceGameId=this.get().activeSourceGameId;try{const reading=await this.capture(config);this.syncContext(this.get().gameTime);if(generation!==this.generation||sourceGameId!==this.get().activeSourceGameId||currentGameResult(this.get()))return this.status();const capturedAt=typeof reading.capturedAt==='number'&&reading.capturedAt>=at&&reading.capturedAt<=this.now()?reading.capturedAt:at;const capturedGameTime=typeof reading.capturedGameTime==='number'&&Number.isFinite(reading.capturedGameTime)?reading.capturedGameTime:sampleGameTime;if(capturedGameTime<0||capturedGameTime>this.get().gameTime+1)throw new Error('OCR 采样时间与当前比赛不一致');this.acceptPlayerReading(reading,capturedAt,capturedGameTime);this.acceptObjectiveReading(reading,capturedAt,capturedGameTime);if(config.enabled){if(!reading.ok)throw new Error(reading.error||'观战经济识别暂不可用');const blue=parseGold(reading.blueText),red=parseGold(reading.redText);this.ocr={blue,red,at:capturedAt,gameTime:capturedGameTime,raw:{blue:reading.blueText!,red:reading.redText!}};}this.error='';}catch(error){if(generation===this.generation)this.error=error instanceof Error?error.message:'无法确认观战经济数字';}finally{if(generation===this.generation)this.probeDurationMs=Math.max(0,this.now()-at);this.pending=false;}const feed=this.status();this.publish(feed);return feed;}
  async poll():Promise<void>{if(this.closed||currentGameResult(this.get())||this.get().awaitingNextGame||this.get().gameClock?.awaitingLiveSample)return;this.syncContext(this.get().gameTime);const feed=this.status();if(this.get().economyFeed?.status!==feed.status||this.get().economyFeed?.source!==feed.source||JSON.stringify(this.get().economyFeed?.players)!==JSON.stringify(feed.players)||JSON.stringify(this.get().economyFeed?.objectives)!==JSON.stringify(feed.objectives))this.publish(feed);const config=this.config();if(this.get().mode!=='live'||(!config.enabled&&!playersEnabled(config)&&!objectivesEnabled(config))||this.pending||this.now()<this.nextProbe)return;this.nextProbe=this.now()+probeInterval;await this.probe();}
}
