import { bundledChampions, bundledChampionVersion, localChampionAssets } from '../shared/champion-art';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ObsClient } from './obs-client';
import { ObsBroadcast } from './obs-broadcast';
import { ObsEngine, engineScene, enginePreviewScene, type ObsEngineOptions } from './obs-engine';
import { LocalApiError, diagnoseReplay, validPlayback, type ReplayDiagnostics } from './replay';
import { EconomyBridge } from './economy';
import { activePlayerFeedPair } from '../shared/player-feeds';
import { normalizePlayerDetails } from './player-details';
import { absorbTerminalGameSample, acceptNextGameSample, explicitWinner, finalizeGame, lcuWinner, matchingTerminalGameSample, sourceGameId } from './game-results';
import { currentGameResult } from '../shared/game-results';
import { captureLiveDraft, observeLcuDraft } from './draft-history';
import type { BroadcastState, Champion, DraftState, GameClockSample, GameEvent, Player, Side, TeamStats } from '../shared/types';
import { gameClockMatchKey } from '../shared/game-clock';
import { clearLiveData, fallbackChampions, ValidationError, record, str } from './state';

const runFile=promisify(execFile);
type Json=Record<string,any>;
const n=(value:unknown,fallback=0):number=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const text=(value:unknown,fallback=''):string=>typeof value==='string'?value:fallback;
const roleNames:Record<string,string>={TOP:'上单',JUNGLE:'打野',MIDDLE:'中单',MID:'中单',BOTTOM:'下路',ADC:'下路',UTILITY:'辅助',SUPPORT:'辅助'};
const roleOrder=['上单','打野','中单','下路','辅助'];
const list=(v:unknown):Json[]=>Array.isArray(v)?v.filter(i=>i&&typeof i==='object'):[];
export function localJson(port:number,pathname:string,options:{authorization?:string;method?:string;body?:unknown}={}):Promise<any>{
  if(!Number.isInteger(port)||port<1||port>65535||!pathname.startsWith('/'))throw new ValidationError('本地接口地址无效');
  return new Promise((resolve,reject)=>{const payload=options.body===undefined?undefined:JSON.stringify(options.body);const req=https.request({hostname:'127.0.0.1',port,path:pathname,method:options.method??'GET',rejectUnauthorized:false,timeout:3000,headers:{Accept:'application/json',...(options.authorization?{Authorization:options.authorization}:{}),...(payload?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}:{})}},res=>{const buffers:Buffer[]=[];let size=0;res.on('data',(b:Buffer)=>{size+=b.length;if(size>5*1024*1024){req.destroy(new LocalApiError('本地接口响应过大','oversize',port,pathname));return;}buffers.push(b);});res.on('end',()=>{if((res.statusCode??500)>=400){reject(new LocalApiError(`本地接口返回 HTTP ${res.statusCode}`,'http',port,pathname,res.statusCode));return;}try{const raw=Buffer.concat(buffers).toString('utf8');resolve(raw?JSON.parse(raw):{});}catch{reject(new LocalApiError('本地接口返回了无效 JSON','invalid-json',port,pathname));}});res.on('error',()=>reject(new LocalApiError('本地接口响应中断','unavailable',port,pathname)));});req.on('timeout',()=>req.destroy(new LocalApiError('本地接口连接超时','timeout',port,pathname)));req.on('error',(error:NodeJS.ErrnoException)=>reject(error instanceof LocalApiError?error:new LocalApiError('本地接口不可用，请确认客户端或回放已经启动',error.code==='ECONNREFUSED'?'refused':'unavailable',port,pathname)));if(payload)req.write(payload);req.end();});
}
export interface LcuCredentials { port:number; password:string; protocol:'https' }
export function parseLockfile(raw:string):LcuCredentials {
  const parts=raw.trim().split(':');const port=Number(parts[2]);if(parts.length!==5||!Number.isInteger(port)||port<1||port>65535||!parts[3]||parts[4]!=='https')throw new ValidationError('lockfile 格式不正确');return {port,password:parts[3],protocol:'https'};
}
export async function discoverLcu(lockfilePath:string,gamePath:string):Promise<LcuCredentials> {
  const candidates=[lockfilePath,...(gamePath?[path.join(gamePath,'lockfile'),path.join(gamePath,'LeagueClient','lockfile')]:[]),...['C:','D:','E:','F:'].flatMap(d=>[`${d}\\Riot Games\\League of Legends\\lockfile`,`${d}\\WeGameApps\\英雄联盟\\LeagueClient\\lockfile`,`${d}\\WeGameApps\\英雄联盟\\lockfile`,`${d}\\Program Files\\腾讯游戏\\英雄联盟\\LeagueClient\\lockfile`,`${d}\\Program Files (x86)\\腾讯游戏\\英雄联盟\\LeagueClient\\lockfile`,`${d}\\腾讯游戏\\英雄联盟\\LeagueClient\\lockfile`])].filter(Boolean);
  for(const file of candidates){try{return parseLockfile(await readFile(file,'utf8'));}catch{/* try next installation */}}
  if(process.platform==='win32')try{
    const {stdout}=await runFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe' OR Name='LeagueClient.exe'\" | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress"],{windowsHide:true,timeout:5000,maxBuffer:1024*1024});
    const parsed=JSON.parse(stdout||'[]');for(const p of (Array.isArray(parsed)?parsed:[parsed])){
      if(p.ExecutablePath)try{return parseLockfile(await readFile(path.join(path.dirname(p.ExecutablePath),'lockfile'),'utf8'));}catch{/* command line discovery below */}
      const command=text(p.CommandLine);const port=command.match(/--app-port[= ](\d+)/)?.[1];const password=command.match(/--remoting-auth-token[= ]([^\s"]+)/)?.[1];if(port&&password)return {port:Number(port),password,protocol:'https'};
    }
  }catch{/* credentials remain local; never log process command lines */}
  throw new Error('未找到国服客户端 lockfile。请启动客户端，并在设置中指定 LeagueClient\\lockfile 路径。');
}
function championBy(champions:Champion[],value:unknown):Champion|undefined {return champions.find(c=>c.key===Number(value)||c.id===value||c.name===value);}
const sideValue=(v:unknown):Side|undefined=>[1,100,'1','100','ORDER','BLUE'].includes(v as any)?'blue':[2,200,'2','200','CHAOS','RED'].includes(v as any)?'red':undefined;
function playerSide(p:Json,flow:Json):Side|undefined {
  const direct=sideValue(p.teamId)??sideValue(p.team);if(direct)return direct;
  const gd=flow.gameData??{};for(const [field,side]of [['teamOne','blue'],['teamTwo','red']]as const){if(list(gd[field]).some(x=>(p.puuid&&x.puuid===p.puuid)||(p.summonerId&&String(x.summonerId)===String(p.summonerId))))return side;}
  return undefined;
}
export function normalizeDraft(session:Json,flow:Json,champions:Champion[]):{draft:DraftState;players:Player[]}|null {
  const myTeam=list(session.myTeam),theirTeam=list(session.theirTeam);const roster=[...myTeam,...theirTeam];const byCell=new Map<number,Side>();
  const groupSide=(group:Json[])=>{const known=new Set(group.map(p=>playerSide(p,flow)).filter((s):s is Side=>s!==undefined));return known.size===1?[...known][0]:undefined;};
  let mySide=groupSide(myTeam),theirSide=groupSide(theirTeam);if(mySide&&theirSide&&mySide===theirSide)return null;if(mySide&&!theirSide)theirSide=mySide==='blue'?'red':'blue';else if(theirSide&&!mySide)mySide=theirSide==='blue'?'red':'blue';
  const sides=new Map<Json,Side>();for(const group of [{players:myTeam,side:mySide},{players:theirTeam,side:theirSide}])for(const p of group.players){const side=playerSide(p,flow)??group.side;if(side){sides.set(p,side);if(n(p.cellId,-1)>=0)byCell.set(p.cellId,side);}}
  if(roster.some(p=>!sides.has(p)))return null;
  const idOf=(id:unknown)=>championBy(champions,id)?.id??(Number(id)>0?String(id):'');
  // Actions are a matrix (simultaneous choices), sorted by action id for actual BP order.
  const flat:Json[]=Array.isArray(session.actions)?session.actions.flatMap((row:any)=>Array.isArray(row)?row:[row]).filter((a:any)=>a&&typeof a==='object'):[];
  flat.sort((a,b)=>n(a.id)-n(b.id));
  const remaining=n(session.timer?.adjustedTimeLeftInPhase,n(session.timer?.timeLeftInPhase));
  const draft:DraftState={bluePicks:[],redPicks:[],blueBans:[],redBans:[],timer:Math.max(0,Math.ceil(remaining/1000)),activeTeam:'blue',action:'等待选人',locked:false};
  for(const a of flat){if(!['pick','ban'].includes(a.type))continue;const side=byCell.get(n(a.actorCellId,-1))??(typeof a.isAllyAction==='boolean'?(a.isAllyAction?mySide:theirSide):undefined);const id=idOf(a.championId);if(side&&id&&a.completed){const key=`${side}${a.type==='ban'?'Bans':'Picks'}` as 'bluePicks';draft[key].push(id);}if(a.isInProgress&&side){draft.activeTeam=side;draft.action=a.type==='ban'?'禁用英雄':'选择英雄';}}
  for(const [side,bans]of [[mySide,session.bans?.myTeamBans],[theirSide,session.bans?.theirTeamBans]]as const){if(side&&Array.isArray(bans)){const key=`${side}Bans`as const;const summary=bans.map(idOf).filter(Boolean);if(summary.length>draft[key].length)draft[key]=summary;}}
  const completedPicks=[...draft.bluePicks,...draft.redPicks];draft.locked=draft.bluePicks.length===5&&draft.redPicks.length===5&&new Set(completedPicks).size===10;
  for(const side of ['blue','red']as const){if(!draft[`${side}Picks`].length)draft[`${side}Picks`]=roster.filter(p=>sides.get(p)===side).map(p=>idOf(p.championId)).filter(Boolean);draft[`${side}Picks`]=draft[`${side}Picks`].slice(0,5);draft[`${side}Bans`]=draft[`${side}Bans`].slice(0,5);}
  const players=roster.flatMap((p,i)=>{const side=sides.get(p);if(!side)return [];const c=championBy(champions,p.championId);return [{id:`lcu-${p.puuid||p.summonerId||(p.cellId??i)}`,name:text(p.gameName)||text(p.displayName)||text(p.summonerName)||`选手 ${i+1}`,role:roleNames[text(p.assignedPosition).toUpperCase()]??'待分路',championId:c?.id??idOf(p.championId),championName:c?.name??'待选择',team:side,kills:0,deaths:0,assists:0,cs:0,level:1,gold:null,items:[]} satisfies Player];});
  return {draft,players};
}
export function normalizeLive(data:Json,champions:Champion[]):{players:Player[];stats:BroadcastState['stats'];events:GameEvent[];gameTime:number;ended:boolean;winner?:Side} {
  const allPlayers=list(data.allPlayers);const active=data.activePlayer;const gameTime=n(data.gameData?.gameTime);const sampledAt=new Date().toISOString();
  const activeIdentity=(p:Json):boolean=>!!active&&typeof active==='object'&&(text(active.riotId)?text(p.riotId)===text(active.riotId):!!text(active.summonerName)&&text(p.summonerName)===text(active.summonerName)&&allPlayers.filter(other=>text(other.summonerName)===text(active.summonerName)).length===1);
  const positive=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const players:Player[]=allPlayers.flatMap((p,i)=>{const side=sideValue(p.team);if(!side)return [];const raw=text(p.rawChampionName).replace(/^game_character_displayname_/, '');const c=championBy(champions,raw)||championBy(champions,p.championName);const scores=p.scores??{};const statsAvailable=['kills','deaths','assists','creepScore'].every(key=>typeof scores[key]==='number'&&Number.isFinite(scores[key])&&Number.isInteger(scores[key])&&scores[key]>=0);const total=positive(p.totalGold)?p.totalGold:null;const liveItems=list(p.items);const slotted=liveItems.filter(item=>Number.isInteger(item.slot)&&item.slot>=0&&item.slot<=6);const itemSlots=slotted.length?Array<number>(7).fill(0):undefined;if(itemSlots)for(const item of slotted)itemSlots[item.slot]=Math.max(0,n(item.itemID));
    const sourceStats=p.championStats??(activeIdentity(p)?active.championStats:undefined);const combat:Partial<Player>={};if(total!==null){combat.goldSource='api';combat.goldGameTime=gameTime;combat.goldSampledAt=sampledAt;}if(positive(p.currentGold))combat.currentGold=p.currentGold;else if(activeIdentity(p)&&positive(active.currentGold))combat.currentGold=active.currentGold;for(const [source,target]of [['currentHealth','health'],['maxHealth','maxHealth'],['resourceValue','resource'],['resourceMax','maxResource']]as const)if(positive(sourceStats?.[source]))combat[target]=sourceStats[source];if(text(sourceStats?.resourceType))combat.resourceType=sourceStats.resourceType;if(typeof p.isDead==='boolean')combat.isDead=p.isDead;if(positive(p.respawnTimer))combat.respawnTimer=p.respawnTimer;
    Object.assign(combat,normalizePlayerDetails(p,activeIdentity(p)?active:undefined));
    const runeIds=[p.runes?.keystone?.id,p.runes?.primaryRuneTree?.id,p.runes?.secondaryRuneTree?.id].filter((id):id is number=>Number.isInteger(id)&&id>0);if(runeIds.length)combat.runeIds=runeIds;
    return [{id:`live-${text(p.riotId)||text(p.summonerName)||i}`,name:text(p.riotIdGameName)||text(p.summonerName)||text(p.riotId)||`选手 ${i+1}`,role:roleNames[text(p.position).toUpperCase()]??'待分路',championId:c?.id??raw,championName:c?.name??text(p.championName,'未知英雄'),statsAvailable,...(statsAvailable?{statsSource:'api' as const,statsSampledAt:sampledAt,statsGameTime:gameTime}:{}),kills:n(scores.kills),deaths:n(scores.deaths),assists:n(scores.assists),cs:n(scores.creepScore),level:n(p.level,1),gold:total,items:liveItems.sort((a,b)=>n(a.slot)-n(b.slot)).map(i=>n(i.itemID)).filter(i=>i>0),...(itemSlots?{itemSlots}:{}),team:side,runes:[text(p.runes?.keystone?.displayName),text(p.runes?.primaryRuneTree?.displayName),text(p.runes?.secondaryRuneTree?.displayName)].filter(Boolean),...combat}];
  }).sort((a,b)=>a.team.localeCompare(b.team)||((roleOrder.indexOf(a.role)<0?5:roleOrder.indexOf(a.role))-(roleOrder.indexOf(b.role)<0?5:roleOrder.indexOf(b.role))));
  const playerNames=new Map<string,Side|undefined>();for(const p of list(data.allPlayers)){const side=sideValue(p.team);if(side)for(const value of [p.summonerName,p.riotId,p.riotIdGameName])if(typeof value==='string'&&value){if(!playerNames.has(value))playerNames.set(value,side);else if(playerNames.get(value)!==side)playerNames.set(value,undefined);}}
  const eventSide=(name:string):Side|undefined=>playerNames.get(name)??(name.match(/^Minion_T(100|200)(?:_|[A-Z])/)?.[1]==='100'?'blue':name.match(/^Minion_T(100|200)(?:_|[A-Z])/)?.[1]==='200'?'red':undefined);
  const empty=():TeamStats=>({kills:0,gold:null,towers:0,dragons:0,barons:0});const stats={blue:empty(),red:empty()};for(const side of ['blue','red']as const){const members=players.filter(p=>p.team===side);stats[side].kills=members.reduce((v,p)=>v+p.kills,0);stats[side].gold=members.length&&members.every(p=>p.gold!==null)?members.reduce((v,p)=>v+(p.gold??0),0):null;}
  let ended=false;const events:GameEvent[]=list(data.events?.Events).filter(e=>typeof e.EventTime==='number'&&Number.isFinite(e.EventTime)&&e.EventTime>=0&&e.EventTime<=gameTime+.25).map((e,i)=>{const name=text(e.EventName);const killer=text(e.KillerName);let side=eventSide(killer);let message=name;if(name==='ChampionKill')message=`${killer} 击杀 ${text(e.VictimName)}`;if(name==='FirstBlood'){side=eventSide(text(e.Recipient));message=`${text(e.Recipient)} 拿下一血`;}if(name==='DragonKill'){message=`${killer} 击杀 ${text(e.DragonType,'亚龙')}`;if(side)stats[side].dragons++;}if(name==='BaronKill'){message=`${killer} 击杀纳什男爵`;if(side)stats[side].barons++;}if(name==='TurretKilled'){const turret=text(e.TurretKilled);const destroyed=turret.match(/Turret_T([12])_/);if(destroyed)side=destroyed[1]==='1'?'red':'blue';message=`${side==='blue'?'蓝方':side==='red'?'红方':killer} 摧毁防御塔`;if(side)stats[side].towers++;}if(name==='GameStart')message='对局开始';if(name==='GameEnd'){message='对局结束';ended=true;}return {id:`live-${e.EventID??i}`,time:n(e.EventTime),type:name,text:message,...(side?{team:side}:{})};});
  const end=list(data.events?.Events).find(e=>e.EventName==='GameEnd'&&typeof e.EventTime==='number'&&Number.isFinite(e.EventTime)&&e.EventTime>=0&&e.EventTime<=gameTime+.25);
  const winner=end?explicitWinner(end.WinningTeam??end.winningTeam):undefined;
  return {players,stats,events:events.slice(-1000),gameTime,ended,...(winner?{winner}:{})};
}
export class ChampionCatalog {
  version=bundledChampionVersion;champions=bundledChampions();private pending:Promise<void>|null=null;private loadedAt=0;
  constructor(private dataDir:string){}
  async load():Promise<void>{
    if(this.pending)return this.pending;if(Date.now()-this.loadedAt<3600000)return;
    this.pending=(async()=>{const file=path.join(this.dataDir,'champions.json');try{const cached=JSON.parse(await readFile(file,'utf8'));if(Array.isArray(cached.champions)&&cached.champions.length>0){this.champions=localChampionAssets(cached.champions);this.version=cached.version;}}catch{/* bundled fallback */}
      try{const versions=await fetch('https://ddragon.leagueoflegends.com/api/versions.json',{signal:AbortSignal.timeout(7000)}).then(r=>{if(!r.ok)throw Error();return r.json();})as string[];const version=versions[0];if(!/^\d+\.\d+\.\d+$/.test(version))throw Error();const data=await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion.json`,{signal:AbortSignal.timeout(7000)}).then(r=>{if(!r.ok)throw Error();return r.json();})as Json;this.version=version;this.champions=localChampionAssets(Object.values(data.data).map((c:any)=>({id:c.id,key:Number(c.key),name:c.name,title:c.title,tags:c.tags,image:`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}`,splash:`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${c.id}_0.jpg`})));await mkdir(this.dataDir,{recursive:true});await writeFile(file,JSON.stringify({version:this.version,champions:this.champions}));}catch{/* use local catalog; never replace live match data */}this.loadedAt=Date.now();})();
    try{await this.pending;}finally{this.pending=null;}
  }
}
export class Adapters {
  private engine?:ObsEngine;
  private credentials:LcuCredentials|null=null;private obs=new ObsClient();private obsPassword='';private requested=new Set<'lcu'|'live'|'replay'|'obs'>();private polling=false;
  private lastReplayDiagnostic:ReplayDiagnostics|undefined;
  private clockIdentity='';
  private clockSessionId=randomUUID();
  private clockDiscontinuity=0;
  private replayClock?:GameClockSample;
  private lastLiveReading?:{time:number;at:number};
  private liveEnded=false;
  private awaitingLiveAfterSeek=false;
  private seekConfirmedAt=0;
  private replaySampleMonotonic=0;
  private playerFeedsSignature='';
  private playerFeedsSync?:Promise<{applied:boolean;scenes?:string[];detail?:string}>;
  private playerFeedsRetry?:{signature:string;after:number;detail:string};
  private cameraPreviewPrepared=false;
  private broadcastOutput=new ObsBroadcast(()=>this.get().connections.obs.status==='connected',(request,data)=>this.obs.call(request,data));
  constructor(private get:()=>BroadcastState,private commit:(work:(s:BroadcastState)=>void)=>void,private catalog:ChampionCatalog,private request:typeof localJson=localJson,private economy?:EconomyBridge){this.obs.on('ConnectionClosed',()=>{this.playerFeedsSignature='';this.playerFeedsRetry=undefined;this.cameraPreviewPrepared=false;if(this.requested.has('obs'))this.status('obs','disconnected','OBS WebSocket 已断开');});this.obs.on('Identified',()=>{this.playerFeedsSignature='';this.playerFeedsRetry=undefined;this.cameraPreviewPrepared=false;});this.obs.on('ConnectionError',()=>this.status('obs','error','OBS WebSocket 连接失败'));}
  setPassword(password:string){this.obsPassword=password;}
  private ensureClockSession(state:BroadcastState){const identity=JSON.stringify([gameClockMatchKey(state),state.players.map(player=>[player.id,player.championId,player.team]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);if(identity===this.clockIdentity&&(state.gameClock||!this.lastLiveReading&&!this.replayClock))return;this.clockIdentity=identity;this.clockSessionId=randomUUID();this.clockDiscontinuity=0;this.replayClock=undefined;this.lastLiveReading=undefined;this.liveEnded=false;this.awaitingLiveAfterSeek=false;}
  private clockSample(state:BroadcastState,source:'live'|'replay',gameTime:number,speed:number,paused:boolean,at:number,forceDiscontinuity=false):GameClockSample{
    this.ensureClockSession(state);const previous=state.gameClock;const same=previous?.sessionId===this.clockSessionId&&previous.source===source;const elapsed=previous?Math.max(0,at-Date.parse(previous.sampledAt))/1000:0;const expected=previous?previous.gameTime+(previous.paused?0:elapsed*previous.speed):gameTime;
    if(forceDiscontinuity||same&&(gameTime<previous!.gameTime-.5||Math.abs(gameTime-expected)>Math.max(2,speed*.75)))this.clockDiscontinuity++;
    return {source,gameTime,speed,paused,sampledAt:new Date(at).toISOString(),sessionId:this.clockSessionId,discontinuity:this.clockDiscontinuity,matchKey:gameClockMatchKey(state),validForMs:Math.min(15000,Math.max(3000,state.settings.pollInterval*3)),...(this.awaitingLiveAfterSeek?{awaitingLiveSample:true}:{})};
  }
  private sampleReplay(data:{paused:boolean;time:number;speed:number;length?:number},forceDiscontinuity=false){const at=Date.now();this.commit(state=>{state.connections.replay={status:'connected',detail:'Replay API 已连接 · 播放控制仅用于回放',updatedAt:new Date(at).toISOString()};if(state.mode!=='live'||currentGameResult(state)||state.awaitingNextGame)return;this.ensureClockSession(state);if(forceDiscontinuity){this.awaitingLiveAfterSeek=true;this.seekConfirmedAt=performance.now();}this.replaySampleMonotonic=performance.now();this.replayClock=this.clockSample(state,'replay',data.time,data.speed,data.paused||this.liveEnded||(typeof data.length==='number'&&Number.isFinite(data.length)&&data.time>=data.length),at,forceDiscontinuity);state.gameClock=this.replayClock;});}
  async spectatorFrame():Promise<Buffer>{return this.requireEngine().spectatorFrame();}
  async initializeObsEngine(options:Omit<ObsEngineOptions,'onConnection'>){this.engine=new ObsEngine(this.obs,{...options,onConnection:(status,detail)=>{this.requested.add('obs');this.status('obs',status,detail);}});await this.engine.initialize();}
  private status(target:'lcu'|'live'|'replay'|'obs',status:BroadcastState['connections']['lcu']['status'],detail:string){this.commit(s=>{const updatedAt=status==='connected'?new Date().toISOString():s.connections[target].updatedAt;s.connections[target]={status,detail,...(updatedAt?{updatedAt}:{})};});}
  async connect(target:'lcu'|'live'|'replay'|'obs'){this.requested.add(target);this.status(target,'connecting','正在连接本地服务');try{if(target==='obs'){if(this.engine?.mode==='embedded'){await this.engine.start();this.playerFeedsRetry=undefined;await this.syncPlayerFeeds().catch(()=>{});return;}await this.obs.disconnect().catch(()=>{});await this.obs.connect(this.get().settings.obsUrl,this.obsPassword,{rpcVersion:1});this.status('obs','connected','外部 OBS WebSocket 5.x 已连接');await this.syncPlayerFeeds().catch(()=>{});return;}
      if(target==='lcu'){this.credentials=await discoverLcu(this.get().settings.lockfilePath,this.get().settings.gamePath);await this.pollLcu();return;}if(target==='live'){await this.pollLive();return;}await this.pollReplay();
    }catch(error){const reported=target==='replay'?await this.replayFailure(error):error;this.status(target,'error',reported instanceof Error?reported.message:'连接失败');throw reported;}}
  private async lcuGet(endpoint:string){if(!this.credentials)throw new Error('客户端认证信息不可用');return this.request(this.credentials.port,endpoint,{authorization:`Basic ${Buffer.from(`riot:${this.credentials.password}`).toString('base64')}`});}
  async poll(){if(this.polling)return;this.polling=true;try{if(!currentGameResult(this.get()))void this.economy?.poll();for(const target of ['lcu','live','replay']as const){if(!this.requested.has(target))continue;try{if(target==='lcu')await this.pollLcu();else if(target==='live')await this.pollLive();else await this.pollReplay();}catch(error){const reported=target==='replay'?await this.replayFailure(error):error;this.status(target,'error',reported instanceof Error?reported.message:'本地接口不可用');if(target==='lcu')this.credentials=null;}}}finally{this.polling=false;}}
  private async pollLcu(){if(!this.credentials)this.credentials=await discoverLcu(this.get().settings.lockfilePath,this.get().settings.gamePath);let flow:Json;let missingSession=false;try{flow=await this.lcuGet('/lol-gameflow/v1/session');}catch(error){if(!(error instanceof LocalApiError)||error.kind!=='http'||error.statusCode!==404)throw error;const phase=await this.lcuGet('/lol-gameflow/v1/gameflow-phase');if(typeof phase!=='string'||!phase.trim())throw new LocalApiError('LCU 游戏阶段响应无效','invalid-json',this.credentials.port,'/lol-gameflow/v1/gameflow-phase');flow={phase};missingSession=true;}const phase=text(flow.phase);let draft:ReturnType<typeof normalizeDraft>=null;if(phase==='ChampSelect'&&!missingSession){const session=await this.lcuGet('/lol-champ-select/v1/session');draft=normalizeDraft(session,flow,this.catalog.champions);}const endStats=['EndOfGame','WaitingForStats'].includes(phase)?await this.lcuGet('/lol-end-of-game/v1/eog-stats-block').catch(()=>null):null;
    this.commit(s=>{s.connections.lcu={status:'connected',detail:phase==='ChampSelect'&&!draft?'已连接 · 等待可确认的游戏流程与蓝红方信息':missingSession&&['None','Lobby'].includes(phase)?'已连接 · 大厅暂未创建对局，等待 BP':`已连接 · ${phase||'大厅'}`,updatedAt:new Date().toISOString()};if(s.mode!=='live')return;const id=sourceGameId(flow.gameData?.gameId??endStats?.gameId);if(currentGameResult(s)){if(['EndOfGame','WaitingForStats'].includes(phase))finalizeGame(s,{source:'lcu',winner:lcuWinner(endStats),sourceGameId:id});return;}if(['EndOfGame','WaitingForStats'].includes(phase)&&!s.awaitingNextGame){finalizeGame(s,{source:'lcu',winner:lcuWinner(endStats),sourceGameId:id});return;}if(phase==='ChampSelect'&&s.phase!=='draft')clearLiveData(s);if(s.settings.autoPhase){if(phase==='ChampSelect')s.phase='draft';else if(phase==='InProgress'&&!s.awaitingNextGame)s.phase='live';else if(phase==='PreEndOfGame')s.phase='live';else if(!s.awaitingNextGame)s.phase='pregame';}if(draft){s.draft=draft.draft;s.players=draft.players;}observeLcuDraft(s,{phase,draft:draft?.draft,players:draft?.players,gameId:flow.gameData?.gameId});});
  }
  private async pollLive(){const requestStartedAt=performance.now();const data=await this.request(2999,'/liveclientdata/allgamedata');const sampledAt=Date.now();const normalized=normalizeLive(data,this.catalog.champions);if(!normalized.players.length)throw new Error('游戏客户端尚未返回选手数据');if(typeof data.gameData?.gameTime!=='number'||!Number.isFinite(data.gameData.gameTime)||data.gameData.gameTime<0)throw new LocalApiError('游戏客户端未提供有效游戏时间','invalid-json',2999,'/liveclientdata/allgamedata');const sampleId=sourceGameId(data.gameData?.gameId);if(currentGameResult(this.get())){this.commit(s=>{s.connections.live={status:"connected",detail:"本局已保存赛后结果",updatedAt:new Date().toISOString()};if(normalized.ended&&matchingTerminalGameSample(s,{...normalized,sourceGameId:sampleId})){absorbTerminalGameSample(s,{...normalized,sourceGameId:sampleId});finalizeGame(s,{source:"live",winner:normalized.winner,sourceGameId:sampleId,terminal:true});}});return;}if(!acceptNextGameSample(structuredClone(this.get()),{...normalized,sourceGameId:sampleId})){this.status("live","connected","等待下一局客户端样本");return;}this.economy?.observePlayers(normalized.players,normalized.gameTime);const bridged=this.economy?.resolve(normalized.gameTime,normalized.stats);if(bridged){normalized.stats=bridged.stats;normalized.players=this.economy!.resolvePlayers(normalized.players);bridged.feed.players=this.economy!.playerStatus(normalized.players);for(const side of ['blue','red']as const)normalized.stats[side].kills=normalized.players.filter(player=>player.team===side).reduce((sum,player)=>sum+player.kills,0);}this.commit(s=>{s.connections.live={status:'connected',detail:normalized.stats.blue.gold===null||normalized.stats.red.gold===null?'已连接 · API 未提供累计经济，可启用观战经济数据桥':bridged&&bridged.feed.source!=='api'?`Live Client 已连接 · ${bridged.feed.detail}`:'Live Client Data 已连接',updatedAt:new Date().toISOString()};if(s.mode!=='live')return;if(!acceptNextGameSample(s,{...normalized,sourceGameId:sampleId}))return;if(sampleId)s.activeSourceGameId=sampleId;if(normalized.gameTime<s.gameTime-1)s.economy=[];Object.assign(s,{players:normalized.players,stats:normalized.stats,events:normalized.events,gameTime:normalized.gameTime});captureLiveDraft(s,data.gameData?.gameId);this.ensureClockSession(s);if(this.awaitingLiveAfterSeek&&this.replayClock&&requestStartedAt>=this.seekConfirmedAt){const playback=this.replayClock;const speed=playback.paused?0:playback.speed;const expectedStart=playback.gameTime+Math.max(0,requestStartedAt-this.replaySampleMonotonic)/1000*speed;const expectedEnd=playback.gameTime+Math.max(0,performance.now()-this.replaySampleMonotonic)/1000*speed;if(normalized.gameTime>=expectedStart-.5&&normalized.gameTime<=expectedEnd+.5){this.awaitingLiveAfterSeek=false;delete this.replayClock.awaitingLiveSample;}}const stationary=!!this.lastLiveReading&&sampledAt-this.lastLiveReading.at>=300&&Math.abs(normalized.gameTime-this.lastLiveReading.time)<.01;this.liveEnded=normalized.ended;const replayFresh=!!this.replayClock&&performance.now()-this.replaySampleMonotonic<this.replayClock.validForMs;const liveClock=this.clockSample(s,'live',normalized.gameTime,1,normalized.ended||stationary||!!this.replayClock&&!replayFresh,sampledAt);this.lastLiveReading={time:normalized.gameTime,at:sampledAt};s.gameClock=replayFresh?this.replayClock:liveClock;if(bridged)s.economyFeed=bridged.feed;if(s.selectedPlayerId&&!s.players.some(p=>p.id===s.selectedPlayerId))s.selectedPlayerId=null;if(s.settings.autoPhase)s.phase=normalized.ended?'postgame':'live';if(normalized.stats.blue.gold!==null&&normalized.stats.red.gold!==null&&(!bridged||bridged.feed.source==='api')){const prev=s.economy.at(-1);if(!prev||Math.abs(normalized.gameTime-prev.time)>=10)s.economy.push({time:normalized.gameTime,blue:normalized.stats.blue.gold,red:normalized.stats.red.gold,source:bridged?.feed.source??'api'});}s.economy=s.economy.slice(-2000);if(normalized.ended)finalizeGame(s,{source:"live",winner:normalized.winner,sourceGameId:sampleId,terminal:true});});}
  async replayDiagnostics(){this.lastReplayDiagnostic=await diagnoseReplay(this.request,this.get().settings.gamePath);return this.lastReplayDiagnostic;}
  private async pollReplay(){const data=await this.request(2999,'/replay/playback');if(!validPlayback(data))throw new LocalApiError('Replay API 播放状态缺少 paused / time / speed，当前客户端响应不兼容','invalid-json',2999,'/replay/playback');this.lastReplayDiagnostic=undefined;this.sampleReplay(data);}
  private async replayFailure(error:unknown):Promise<Error>{
    if(!(error instanceof LocalApiError))return error instanceof Error?error:new Error('Replay API 连接失败');
    if(!['http','refused','timeout'].includes(error.kind))return error;
    const cached=this.lastReplayDiagnostic;const diagnostic=cached&&cached.status!=='ready'&&Date.now()-Date.parse(cached.lastProbeAt)<10000?cached:await this.replayDiagnostics();
    const detail=diagnostic.status==='ready'?`Replay API 状态读取成功，但当前操作失败（${error.statusCode?`HTTP ${error.statusCode}`:error.message}）。请重新打开回放；若问题持续，检查当前版本是否支持此播放操作。`:diagnostic.detail;
    return new LocalApiError(detail,error.kind,error.port,error.endpoint,error.statusCode);
  }
  async replay(input:unknown){const p=record(input);const body:Json={};if(p.paused!==undefined){if(typeof p.paused!=='boolean')throw new ValidationError('paused 需为布尔值');body.paused=p.paused;}for(const k of ['speed','time']as const)if(p[k]!==undefined){const v=p[k];if(typeof v!=='number'||!Number.isFinite(v)||v<(k==='speed'?.1:0)||v>(k==='speed'?8:86400))throw new ValidationError('回放数值超出范围');body[k]=v;}if(!Object.keys(body).length)throw new ValidationError('需要提供播放控制参数');this.requested.add('replay');try{const result=await this.request(2999,'/replay/playback',{method:'POST',body});if(body.time!==undefined)this.economy?.reset();const playback=validPlayback(result)?result:await this.request(2999,'/replay/playback');if(!validPlayback(playback))throw new LocalApiError('Replay API 播放状态缺少 paused / time / speed，当前客户端响应不兼容','invalid-json',2999,'/replay/playback');this.sampleReplay(playback,body.time!==undefined);return result;}catch(e){const reported=await this.replayFailure(e);this.status('replay','error',reported.message);throw reported;}}
  async obsScenes(){if(this.get().connections.obs.status!=='connected')throw new Error('请先连接 OBS WebSocket');const r=await this.obs.call('GetSceneList');return {scenes:r.scenes.map(s=>({sceneName:String(s.sceneName)})),currentProgramSceneName:r.currentProgramSceneName};}
  async obsScene(input:unknown){const p=record(input);const name=str(p.sceneName,200);const current=await this.obsScenes();if(!current.scenes.some(s=>s.sceneName===name))throw new ValidationError('OBS 场景不存在');await this.obs.call('SetCurrentProgramScene',{sceneName:name});return this.obsScenes();}
  async obsStreamStatus(){return this.broadcastOutput.status();}
  async obsStreamSettings(input:unknown){return this.engine?this.engine.exclusive(()=>this.broadcastOutput.configure(input)):this.broadcastOutput.configure(input);}
  async obsHud(input:unknown,overlayUrl:string){const result=await (this.engine?this.engine.exclusive(()=>this.broadcastOutput.addHud(input,overlayUrl)):this.broadcastOutput.addHud(input,overlayUrl));this.playerFeedsSignature='';this.playerFeedsRetry=undefined;await this.syncPlayerFeeds().catch(()=>{});return result;}
  async obsCameraDevices(){const result=await(this.engine?this.engine.exclusive(()=>this.broadcastOutput.cameraDevices()):this.broadcastOutput.cameraDevices());this.playerFeedsRetry=undefined;return result;}
  /** Called after overlay settings or a take; unchanged state performs no OBS RPCs. */
  async syncPlayerFeeds(force=false):Promise<{applied:boolean;scenes?:string[];detail?:string}>{
    if(force)this.playerFeedsRetry=undefined;
    if(this.get().connections.obs.status!=='connected')return {applied:false,detail:'摄像头配置已保存，连接 OBS 引擎后自动应用'};
    const state=this.get();
    const programVisible=state.programScene==='live',previewVisible=state.previewScene==='live';
    const activeFeeds=activePlayerFeedPair(state.overlay);
    const signature=JSON.stringify({feeds:(['blue','red']as const).map(side=>({side,mode:activeFeeds[side].mode,device:activeFeeds[side].cameraDeviceId})),program:programVisible,preview:previewVisible});
    if(signature===this.playerFeedsSignature)return {applied:true};
    if(this.playerFeedsRetry?.signature===signature&&Date.now()<this.playerFeedsRetry.after)return {applied:false,detail:this.playerFeedsRetry.detail};
    if(this.playerFeedsSync){await this.playerFeedsSync.catch(()=>{});return this.syncPlayerFeeds();}
    const feeds=structuredClone(activeFeeds);
    const apply=async()=>{
      const available=await this.obs.call('GetSceneList');
      const programName=available.scenes.some(scene=>scene.sceneName===engineScene)?engineScene:available.currentProgramSceneName;
      const scenes=[{sceneName:programName,hudName:'RiftCast HUD',visible:programVisible}];
      if(available.scenes.some(scene=>scene.sceneName===enginePreviewScene))scenes.push({sceneName:enginePreviewScene,hudName:'RiftCast 预监 HUD',visible:previewVisible});
      const result=await this.broadcastOutput.applyPlayerFeeds(feeds,scenes);
      if(result.applied)this.playerFeedsSignature=signature;
      return result;
    };
    this.playerFeedsSync=this.engine?this.engine.exclusive(apply):apply();
    try{const result=await this.playerFeedsSync;this.playerFeedsRetry=result.applied?undefined:{signature,after:Date.now()+30000,detail:result.detail??'等待 OBS HUD 场景'};return result;}catch(error){const detail=error instanceof Error?error.message:'摄像头配置应用失败';this.playerFeedsRetry={signature,after:Date.now()+(/正在处理|正在启动/.test(detail)?1000:30000),detail};throw error;}finally{this.playerFeedsSync=undefined;}
  }
  private requireEngine(){if(!this.engine)throw new Error('输出引擎尚未初始化');return this.engine;}
  async obsEngineStatus(){return this.requireEngine().status();}
  async obsEngineStart(){const status=await this.requireEngine().start();this.playerFeedsSignature='';this.playerFeedsRetry=undefined;await this.syncPlayerFeeds().catch(()=>{});return status;}
  async obsEngineMode(input:unknown){return this.requireEngine().setMode(input);}
  async obsEngineSetup(input:unknown){const status=await this.requireEngine().setup(input);this.playerFeedsSignature='';this.playerFeedsRetry=undefined;this.cameraPreviewPrepared=false;await this.syncPlayerFeeds().catch(()=>{});return status;}
  async obsEnginePreview(){return this.requireEngine().preview();}
  async obsEngineMonitor(input:unknown){const result=await this.requireEngine().monitor(input);this.playerFeedsSignature='';this.playerFeedsRetry=undefined;await this.syncPlayerFeeds().catch(()=>{});if(record(input).kind==='preview')this.cameraPreviewPrepared=true;return result;}
  async obsEngineLiveFrame(kind:'preview'|'program'){const frame=await this.requireEngine().liveFrame(kind);if(kind==='preview'&&!this.cameraPreviewPrepared){this.playerFeedsSignature='';this.playerFeedsRetry=undefined;await this.syncPlayerFeeds().catch(()=>{});this.cameraPreviewPrepared=true;}return frame;}
  async obsEngineOutput(input:unknown){return this.requireEngine().output(input);}
  async close(){if(this.engine)await this.engine.close();else await this.obs.disconnect().catch(()=>{});}
}
