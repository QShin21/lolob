import { randomUUID } from 'node:crypto';
import type { BroadcastAction, BroadcastState, Champion, Recording, Team, Match, Player, Side } from '../shared/types';
import { captureManualDraft, getFearlessBans, initializeDraftHistory, startDraftSeries } from './draft-history';
import { createDemoIncomeSnapshot, currentIncomeSnapshot, incomeCategories, incomeCategoryLabels, incomeGameKey, updateIncomeSnapshots } from './player-income';
import { currentGameResult, frozenGameState, reportGameResult, rosterFingerprint } from '../shared/game-results';
import { finalizeGame } from './game-results';

export const scenes = ['standby', 'draft', 'lineup', 'live', 'economy', 'ranking', 'schedule', 'postgame', 'interview', 'teamfight', 'income'] as const;
export const phases = ['pregame', 'draft', 'live', 'postgame'] as const;
const roles = ['上单', '打野', '中单', '下路', '辅助'];
export const fallbackChampionData = [
  ['Aatrox',266,'暗裔剑魔','战士'],['LeeSin',64,'盲僧','刺客'],['Ahri',103,'九尾妖狐','法师'],['Jinx',222,'暴走萝莉','射手'],['Thresh',412,'魂锁典狱长','辅助'],
  ['KSante',897,'纳祖芒荣耀','坦克'],['Vi',254,'皮城执法官','战士'],['Azir',268,'沙漠皇帝','法师'],['Kaisa',145,'虚空之女','射手'],['Nautilus',111,'深海泰坦','坦克'],
  ['Yone',777,'封魔剑魂','刺客'],['Renekton',58,'荒漠屠夫','战士'],['Leblanc',7,'诡术妖姬','法师'],['Ashe',22,'寒冰射手','射手'],['Rell',526,'镕铁少女','辅助'],
  ['Sejuani',113,'北地之怒','坦克'],['Kalista',429,'复仇之矛','射手'],['Orianna',61,'发条魔灵','法师'],['Rumble',68,'机械公敌','战士'],['Poppy',78,'圣锤之毅','坦克'],
] as const;
export function fallbackChampions(version = '16.19.1'): Champion[] {
  return fallbackChampionData.map(([id,key,name,tag]) => ({ id,key,name,title:tag,tags:[tag],image:`https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${id}.png`,splash:`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg` }));
}
export function createSeed(): BroadcastState {
  const names = [['山岚','追风','星河','流光','青禾'],['赤霄','临渊','长夜','烬羽','望舒']];
  const teams: Team[] = [
    {id:'azure',name:'苍穹竞技',tag:'AZR',color:'#48b8ef',players:names[0].map((name,i)=>({name,role:roles[i]}))},
    {id:'ember',name:'赤焰战队',tag:'EMB',color:'#ef665e',players:names[1].map((name,i)=>({name,role:roles[i]}))},
    {id:'jade',name:'青玉之锋',tag:'JAD',color:'#78d3ac',players:roles.map((role,i)=>({name:['竹影','听雨','云舟','晚照','见月'][i],role}))},
    {id:'storm',name:'雷霆先锋',tag:'STM',color:'#bd94f0',players:roles.map((role,i)=>({name:['雷鸣','疾行','远帆','破晓','风语'][i],role}))},
  ];
  const players: Player[] = fallbackChampionData.slice(0,10).map(([id,,name],i)=>{
    // Explicitly synthetic combat values for the demonstration source only.
    const maxHealth=1600+i*70;const maxResource=i===1?200:i===0?100:700+i*35;
    const secondary=i%5===1?{id:11,name:'SummonerSmite'}:i%5===0?{id:12,name:'SummonerTeleport'}:i%5===2?{id:14,name:'SummonerDot'}:i%5===3?{id:7,name:'SummonerHeal'}:{id:3,name:'SummonerExhaust'};
    const [keystoneId,primaryTreeId,secondaryTreeId]=[[8010,8000,8400],[8010,8000,8300],[8112,8100,8200],[8008,8000,8300],[8439,8400,8300]][i%5];
    return {id:`${i<5?'blue':'red'}-${i%5}`,name:names[i<5?0:1][i%5],role:roles[i%5],championId:id,championName:name,kills:[3,2,4,4,1,1,2,3,3,0][i],deaths:[2,1,1,1,4,3,2,4,3,2][i],assists:[3,8,5,4,11,2,5,3,4,8][i],cs:[168,124,191,202,28,158,120,179,188,23][i],level:[13,12,14,13,10,12,11,13,12,10][i],gold:[9400,8100,10600,11100,5400,8300,7600,9500,10400,4900][i],items:[1055,3006,3031,3085,3340],itemSlots:[1055,3006,3031,3085,0,0,3340],itemCounts:[1,1,1,1,0,0,2],team:i<5?'blue':'red',health:Math.round(maxHealth*(.58+i%4*.1)),maxHealth,resource:Math.round(maxResource*(.42+i%3*.18)),maxResource,resourceType:i===1?'ENERGY':i===0?'BLOODWELL':'MANA',experience:120+i*48,maxExperience:880+i*40,ultimate:i%3===1?{state:'cooldown',cooldownRemaining:24+i*3,level:2}:{state:'ready',level:2},visionScore:[12,19,10,8,41,10,18,8,7,37][i],roleQuest:{completed:i%5!==4,progress:i%5===4?440:600,maxProgress:600},runeIds:[keystoneId,primaryTreeId,secondaryTreeId],runeSelection:{keystoneId,primaryTreeId,secondaryTreeId},isDead:false,respawnTimer:0,summonerSpells:[{id:4,name:'SummonerFlash'},secondary]};
  });
  const events = [{id:'demo-1',time:182,type:'FirstBlood',text:'苍穹竞技 · 星河 拿下一血',team:'blue' as const},{id:'demo-2',time:382,type:'DragonKill',text:'赤焰战队 击杀炼狱亚龙',team:'red' as const},{id:'demo-3',time:628,type:'TurretKilled',text:'苍穹竞技 摧毁中路一塔',team:'blue' as const},{id:'demo-4',time:1012,type:'DragonKill',text:'苍穹竞技 击杀海洋亚龙',team:'blue' as const}];
  const seed: BroadcastState = {
    revision:0,mode:'demo',phase:'live',previewScene:'draft',programScene:'live',
    match:{title:'峡谷邀请赛 · 秋季赛',subtitle:'半决赛 · 演示数据',game:2,format:'BO3',blueTeamId:'azure',redTeamId:'ember',blueScore:1,redScore:0,seriesId:'demo-seed-series'},teams,
    schedule:[{id:'m1',title:'半决赛 A',blueTeamId:'azure',redTeamId:'ember',scheduledAt:'2026-10-03T19:00:00+08:00',format:'BO3',status:'live',blueScore:1,redScore:0},{id:'m2',title:'半决赛 B',blueTeamId:'jade',redTeamId:'storm',scheduledAt:'2026-10-03T20:30:00+08:00',format:'BO3',status:'scheduled',blueScore:0,redScore:0},{id:'m3',title:'决赛',blueTeamId:'azure',redTeamId:'jade',scheduledAt:'2026-10-04T19:00:00+08:00',format:'BO5',status:'scheduled',blueScore:0,redScore:0}],
    players,gameTime:1124,paused:false,
    stats:{blue:{kills:14,gold:44600,towers:4,dragons:2,barons:0},red:{kills:9,gold:40700,towers:2,dragons:1,barons:0}},
    draft:{bluePicks:players.slice(0,5).map(p=>p.championId),redPicks:players.slice(5).map(p=>p.championId),blueBans:['Yone','Renekton','Leblanc','Kalista','Rumble'],redBans:['Ashe','Sejuani','Orianna','Rell','Poppy'],timer:24,activeTeam:'blue',action:'选择英雄'},events,
    economy:Array.from({length:20},(_,i)=>({time:i*60,blue:2500+i*2215+Math.round(Math.sin(i/3)*400),red:2500+i*2007+Math.round(Math.cos(i/4)*360)})),
    connections:{lcu:{status:'disconnected',detail:'尚未连接客户端'},live:{status:'disconnected',detail:'等待游戏进入对局'},replay:{status:'disconnected',detail:'仅回放模式支持播放控制'},obs:{status:'disconnected',detail:'连接 OBS WebSocket 5.x'}},
    overlay:{preset:'arena',scoreboard:true,players:true,objectives:true,ticker:false,goldDiff:true,sponsor:'RIFTCAST',tickerText:'峡谷邀请赛 · 欢迎来到比赛直播间',accent:'#83e6c5',scale:1,countdownEnd:null,nativeHud:'auto',patchVersion:'26.18',bottomTitle:'2026 DEMACIA CUP GLOBAL INVITATIONAL',playerFeeds:{blue:{mode:'image',imageUrl:'',cameraDeviceId:'',label:''},red:{mode:'image',imageUrl:'',cameraDeviceId:'',label:''}}},assets:[],recordings:[],selectedPlayerId:null,
    settings:{lockfilePath:'',obsUrl:'ws://127.0.0.1:4455',pollInterval:1500,autoPhase:true,gamePath:''},
    draftHistory:[{seriesId:'demo-seed-series',game:1,blueTeamId:'azure',redTeamId:'ember',bluePicks:fallbackChampionData.slice(10,15).map(c=>c[0]),redPicks:fallbackChampionData.slice(15,20).map(c=>c[0]),recordedAt:'2026-10-03T11:00:00.000Z',source:'demo'}],
  };
  captureManualDraft(seed);
  seed.incomeSnapshots=[createDemoIncomeSnapshot(seed)];
  return seed;
}
export function normalizeSavedState(saved: BroadcastState): BroadcastState {
  const defaults=createSeed();
  // Persistent live states must never acquire sample matches from missing legacy fields.
  if(saved.mode==='live'){
    clearLiveData(defaults);defaults.phase='pregame';defaults.paused=false;
    defaults.draftHistory=[];defaults.incomeSnapshots=[];
  }
  return {...defaults,...saved,overlay:{...defaults.overlay,...saved.overlay,preset:'arena',playerFeeds:{blue:{...defaults.overlay.playerFeeds!.blue,...saved.overlay.playerFeeds?.blue},red:{...defaults.overlay.playerFeeds!.red,...saved.overlay.playerFeeds?.red}}},settings:{...defaults.settings,...saved.settings}};
}
export class ValidationError extends Error {}
export const record = (value: unknown): Record<string,unknown> => { if(!value || typeof value!=='object'||Array.isArray(value)) throw new ValidationError('请求内容必须是对象'); return value as Record<string,unknown>; };
export const str = (value:unknown,max=200): string => { if(typeof value!=='string'||value.length>max) throw new ValidationError(`文本长度须在 ${max} 字以内`); return value; };
const num = (value:unknown,min=0,max=1e15):number => { if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max) throw new ValidationError('数值超出允许范围'); return value; };
const bool = (value:unknown):boolean => { if(typeof value!=='boolean')throw new ValidationError('需要布尔值');return value; };
const oneOf = <T extends string>(value:unknown,choices:readonly T[]):T => {if(typeof value!=='string'||!choices.includes(value as T))throw new ValidationError('未知选项');return value as T;};
const imageUrl = (value:unknown):string => {const url=str(value,2048);if(!/^\/uploads\/[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(url)&&!/^https:\/\//.test(url))throw new ValidationError('图片地址须为已上传素材或 HTTPS 地址');return url;};
function applyBottomOverlay(s:BroadcastState,p:Record<string,unknown>):void {
  if(p.patchVersion!==undefined)s.overlay.patchVersion=str(p.patchVersion,20);
  if(p.bottomTitle!==undefined)s.overlay.bottomTitle=str(p.bottomTitle,150);
  if(p.playerFeeds!==undefined){
    const feeds=record(p.playerFeeds),defaults=createSeed().overlay.playerFeeds!;
    const next={blue:{...defaults.blue,...s.overlay.playerFeeds?.blue},red:{...defaults.red,...s.overlay.playerFeeds?.red}};
    for(const side of ['blue','red'] as const){
      if(feeds[side]===undefined)continue;const feed=record(feeds[side]);
      if(feed.mode!==undefined)next[side].mode=oneOf(feed.mode,['image','camera','off'] as const);
      if(feed.imageUrl!==undefined)next[side].imageUrl=feed.imageUrl===''?'':imageUrl(feed.imageUrl);
      if(feed.cameraDeviceId!==undefined)next[side].cameraDeviceId=str(feed.cameraDeviceId,2048);
      if(feed.label!==undefined)next[side].label=str(feed.label,80);
      if(next[side].mode==='camera'&&!next[side].cameraDeviceId.trim())throw new ValidationError('请选择摄像头源');
    }
    s.overlay.playerFeeds=next;
  }
}
const stringList = (v:unknown):string[]=>{if(!Array.isArray(v)||v.length>5)throw new ValidationError('BP 每侧最多五个英雄');return v.map(i=>str(i,64));};
export function clearLiveData(s: BroadcastState):void {
  s.players=[];s.gameTime=0;s.events=[];s.economy=[];s.selectedPlayerId=null;delete s.economyFeed;delete s.gameClock;
  s.stats={blue:{kills:0,gold:null,towers:0,dragons:0,barons:0},red:{kills:0,gold:null,towers:0,dragons:0,barons:0}};
  s.draft={bluePicks:[],redPicks:[],blueBans:[],redBans:[],timer:0,activeTeam:'blue',action:'等待客户端 BP 数据'};
}
export function resetRuntimeState(s: BroadcastState):void {
  s.overlay.preset='arena';
  initializeDraftHistory(s);
  delete s.nativeHudStatus;
  delete s.gameClock;
  delete s.settings.obsPassword;
  delete s.economyFeed;
  if(s.mode==='live'){if(currentGameResult(s)){const frozen=frozenGameState(s);Object.assign(s,{players:frozen.players,stats:frozen.stats,events:frozen.events,economy:frozen.economy,draft:frozen.draft,gameTime:frozen.gameTime,incomeSnapshots:frozen.incomeSnapshots,phase:'postgame',paused:true});}else{clearLiveData(s);s.phase='pregame';s.paused=false;}}
  s.connections={lcu:{status:'disconnected',detail:'本地服务已启动 · 等待连接'},live:{status:'disconnected',detail:'本地服务已启动 · 等待连接'},replay:{status:'disconnected',detail:'本地服务已启动 · 等待连接'},obs:{status:'disconnected',detail:'本地服务已启动 · 等待连接'}};
}
function prepareMatch(s: BroadcastState):void {
  delete s.draftHistoryPending;
  delete s.finishedGameId;if(!reportGameResult(s))delete s.reportGameId;delete s.awaitingNextGame;delete s.activeSourceGameId;
  clearLiveData(s);s.paused=false;s.phase='pregame';
  s.players=(['blue','red']as const).flatMap((side:Side)=>{
    const team=s.teams.find(t=>t.id===s.match[`${side}TeamId`]);
    return (team?.players??[]).slice(0,5).map((p,i)=>({id:`roster-${team!.id}-${i}`,name:p.name,role:p.role,championId:'',championName:'待选择',team:side,kills:0,deaths:0,assists:0,cs:0,level:1,gold:null,items:[],...(p.portrait?{portrait:p.portrait}:{})}satisfies Player));
  });
}
/** Save only observed match data; detached archived cards can be exported after a restart. */
export function snapshotRecording(state:BroadcastState,options:{id?:string;title?:string;now?:number}={}):Recording {
  const now=options.now??Date.now();
  if(state.mode==='live'&&state.gameClock?.awaitingLiveSample)throw new ValidationError('回放位置已变化，等待当前画面的局内统计重新采样后保存记录');
  const income=currentIncomeSnapshot(state);
  const savedIncome=income?.mode===state.mode?income:undefined;
  if(state.mode==='live'&&savedIncome?.players.some(player=>incomeCategories.some(category=>player.values[category].source==='demo')))throw new ValidationError('当前十分钟卡片含有演示经济来源，无法保存为真实记录');
  const snapshot:Recording={id:options.id??randomUUID(),title:options.title??`${state.match.title} · 第 ${state.match.game} 局`,createdAt:new Date(now).toISOString(),duration:state.gameTime,mode:state.mode,players:structuredClone(state.players),stats:structuredClone(state.stats),events:structuredClone(state.events),economy:structuredClone(state.economy),...(state.economyFeed?{economyFeed:structuredClone(state.economyFeed)}:{}),...(savedIncome?{incomeSnapshots:[structuredClone(savedIncome)]}:{})};
  if(state.mode==='demo')return snapshot;
  const maximumAge=Math.max(10000,state.settings.pollInterval*3);
  const fresh=(value:string|undefined)=>{const time=Date.parse(value??'');return Number.isFinite(time)&&now-time>=-1000&&now-time<=maximumAge;};
  const activeEconomy=snapshot.economyFeed&&['ocr','manual'].includes(snapshot.economyFeed.source)&&snapshot.economyFeed.status==='fresh'&&fresh(snapshot.economyFeed.sampledAt)&&Number.isFinite(Date.parse(snapshot.economyFeed.expiresAt??''))&&Date.parse(snapshot.economyFeed.expiresAt!)>now;
  if(!state.players.length){
    if(activeEconomy){
      snapshot.observedAt=snapshot.economyFeed!.sampledAt;snapshot.sourceGameTime=state.gameTime;snapshot.events=[];
      snapshot.economy=snapshot.economy.filter(point=>Number.isFinite(point.time)&&point.time<=state.gameTime+1&&['manual','ocr'].includes(point.source??'none'));
      return snapshot;
    }
    if(!savedIncome||savedIncome.players.length===0||!Number.isFinite(Date.parse(savedIncome.createdAt)))throw new ValidationError('尚未取得真实对局样本，请连接游戏后保存记录');
    snapshot.observedAt=savedIncome.createdAt;snapshot.sourceGameTime=savedIncome.capturedTime;
    snapshot.duration=savedIncome.capturedTime;snapshot.events=[];snapshot.economy=[];delete snapshot.economyFeed;
    return snapshot;
  }
  if(!Number.isFinite(state.gameTime)||state.gameTime<0)throw new ValidationError('当前游戏时间无效，等待游戏重新采样后保存');
  if(state.events.some(event=>event.id.startsWith('demo-')))throw new ValidationError('当前真实数据含有演示事件，请重新连接游戏后保存');
  const activeApi=state.connections.live.status==='connected'&&fresh(state.connections.live.updatedAt);
  const observed:string[]=[];
  for(const player of snapshot.players){
    if(player.statsAvailable===false)throw new ValidationError('客户端未提供完整的 KDA 和补刀统计，请重新连接或识别计分板后保存');
    if(player.statsSource==='ocr'){
      if(!fresh(player.statsSampledAt)||!Number.isFinite(Date.parse(player.statsExpiresAt??''))||Date.parse(player.statsExpiresAt!)<=now)throw new ValidationError('计分板统计采样已过期，请露出游戏计分板重新识别后保存');
      observed.push(player.statsSampledAt!);
    }else if(player.statsSource==='api'&&fresh(player.statsSampledAt))observed.push(player.statsSampledAt!);
    else if(!player.statsSource&&player.id.startsWith('live-')&&activeApi)observed.push(state.connections.live.updatedAt!);
    else throw new ValidationError('当前选手统计缺少有效游戏采样，请重新连接或识别计分板后保存');
    if(player.goldSource==='ocr'&&(!fresh(player.goldSampledAt)||!Number.isFinite(Date.parse(player.goldExpiresAt??''))||Date.parse(player.goldExpiresAt!)<=now)){
      player.gold=null;delete player.currentGold;delete player.goldSource;delete player.goldSampledAt;delete player.goldExpiresAt;delete player.goldGameTime;
      snapshot.stats[player.team].gold=null;
    }
  }
  if(snapshot.economyFeed&&['ocr','manual'].includes(snapshot.economyFeed.source)&&(!fresh(snapshot.economyFeed.sampledAt)||!Number.isFinite(Date.parse(snapshot.economyFeed.expiresAt??''))||Date.parse(snapshot.economyFeed.expiresAt!)<=now)){
    snapshot.stats.blue.gold=null;snapshot.stats.red.gold=null;
    snapshot.economyFeed.status='stale';snapshot.economyFeed.blue=null;snapshot.economyFeed.red=null;
    snapshot.economyFeed.detail='保存时团队经济采样已过期，未将过期金额写入统计';
  }
  snapshot.observedAt=observed.sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
  snapshot.sourceGameTime=state.gameTime;
  // A replay API may expose the full event list before playback reaches those events.
  snapshot.events=snapshot.events.filter(event=>Number.isFinite(event.time)&&event.time<=state.gameTime+1);
  snapshot.economy=snapshot.economy.filter(point=>Number.isFinite(point.time)&&point.time<=state.gameTime+1);
  return snapshot;
}
export function applyAction(current:BroadcastState,input:unknown):BroadcastState {
  const a=record(input);const type=str(a.type,40);const s=structuredClone(current);
  s.overlay.preset='arena';
  initializeDraftHistory(s);
  if(type==='set-overlay')applyBottomOverlay(s,record(a.patch));
  switch(type as BroadcastAction['type']) {
    case 'set-mode': {const next=oneOf(a.mode,['demo','live']);if(next!==s.mode){s.mode=next;delete s.finishedGameId;delete s.reportGameId;delete s.awaitingNextGame;delete s.activeSourceGameId;startDraftSeries(s);if(next==='live'){clearLiveData(s);s.paused=false;s.phase='pregame';}else {const d=createSeed();Object.assign(s,{players:d.players,stats:d.stats,events:d.events,economy:d.economy,draft:d.draft,gameTime:d.gameTime,phase:d.phase,paused:false});if(s.match.game>1)s.draftHistory!.push({...d.draftHistory![0],seriesId:s.match.seriesId!,game:s.match.game-1,blueTeamId:s.match.blueTeamId,redTeamId:s.match.redTeamId});captureManualDraft(s);s.incomeSnapshots=[...(s.incomeSnapshots??[]).filter(entry=>entry.gameKey!==incomeGameKey(s)),createDemoIncomeSnapshot(s)];}}break;}
    case 'set-phase':s.phase=oneOf(a.phase,phases);if(s.phase==='live')captureManualDraft(s);break;
    case 'preview-scene':s.previewScene=oneOf(a.scene,scenes);break;
    case 'take':s.programScene=a.scene===undefined?s.previewScene:oneOf(a.scene,scenes);break;
    case 'set-overlay': {const p=record(a.patch);if(p.preset!==undefined){oneOf(p.preset,['arena','worlds2025','lpl2025']);s.overlay.preset='arena';}if(p.nativeHud!==undefined)s.overlay.nativeHud=oneOf(p.nativeHud,['auto','mask','off'] as const);for(const k of ['scoreboard','players','objectives','ticker','goldDiff'] as const)if(p[k]!==undefined)s.overlay[k]=bool(p[k]);for(const k of ['sponsor','tickerText'] as const)if(p[k]!==undefined)s.overlay[k]=str(p[k],k==='tickerText'?500:80);if(p.sponsorLogo!==undefined){if(p.sponsorLogo==='')delete s.overlay.sponsorLogo;else s.overlay.sponsorLogo=imageUrl(p.sponsorLogo);}if(p.accent!==undefined){const c=str(p.accent,7);if(!/^#[0-9a-f]{6}$/i.test(c))throw new ValidationError('颜色需使用 #RRGGBB');s.overlay.accent=c;}if(p.scale!==undefined)s.overlay.scale=num(p.scale,.5,2);if(p.countdownEnd!==undefined)s.overlay.countdownEnd=p.countdownEnd===null?null:num(p.countdownEnd);break;}
    case 'set-match': {const p=record(a.patch);for(const k of ['title','subtitle','format'] as const)if(p[k]!==undefined)s.match[k]=str(p[k],150);for(const k of ['game','blueScore','redScore'] as const)if(p[k]!==undefined)s.match[k]=Math.floor(num(p[k],k==='game'?1:0,99));for(const k of ['blueTeamId','redTeamId'] as const)if(p[k]!==undefined){const id=str(p[k],80);if(!s.teams.some(t=>t.id===id))throw new ValidationError('队伍不存在');s.match[k]=id;}if(s.match.blueTeamId===s.match.redTeamId)throw new ValidationError('对阵双方需为不同队伍');const changedTeams=[s.match.blueTeamId,s.match.redTeamId].sort().join('\0')!==[current.match.blueTeamId,current.match.redTeamId].sort().join('\0');if(p.seriesId!==undefined){const id=str(p.seriesId,150);if(!id.trim())throw new ValidationError('系列赛 ID 不能为空');startDraftSeries(s,id);}else if(changedTeams||(s.match.game===1&&current.match.game>1))startDraftSeries(s);if((['blueTeamId','redTeamId','game','seriesId']as const).some(k=>s.match[k]!==current.match[k]))prepareMatch(s);break;}
    case 'set-settings': {const p=record(a.patch);for(const k of ['lockfilePath','gamePath'] as const)if(p[k]!==undefined)s.settings[k]=str(p[k],1024);if(p.obsUrl!==undefined){const url=str(p.obsUrl,200);let u:URL;try{u=new URL(url);}catch{throw new ValidationError('OBS 地址无效');}if(!['ws:','wss:'].includes(u.protocol)||u.username||u.password)throw new ValidationError('OBS 地址需使用 ws:// 或 wss://');s.settings.obsUrl=url;}if(p.obsPassword!==undefined)str(p.obsPassword,300);if(p.pollInterval!==undefined)s.settings.pollInterval=Math.floor(num(p.pollInterval,500,10000));if(p.autoPhase!==undefined)s.settings.autoPhase=bool(p.autoPhase);break;}
    case 'set-teams': {if(!Array.isArray(a.teams)||a.teams.length<2||a.teams.length>64)throw new ValidationError('队伍数量应为 2–64');s.teams=a.teams.map(v=>{const t=record(v);const roster=t.players;if(!Array.isArray(roster)||roster.length>20)throw new ValidationError('选手名单格式错误');const color=str(t.color,7);if(!/^#[0-9a-f]{6}$/i.test(color))throw new ValidationError('队伍颜色需使用 #RRGGBB');return {id:str(t.id,80),name:str(t.name,80),tag:str(t.tag,12),color,...(t.logo?{logo:imageUrl(t.logo)}:{}),players:roster.map(v=>{const p=record(v);return{name:str(p.name,80),role:str(p.role,30),...(p.portrait?{portrait:imageUrl(p.portrait)}:{})};})};});const ids=new Set(s.teams.map(t=>t.id));if(ids.size!==s.teams.length)throw new ValidationError('队伍 ID 重复');if(![s.match.blueTeamId,s.match.redTeamId,...s.schedule.flatMap(m=>[m.blueTeamId,m.redTeamId])].every(id=>ids.has(id)))throw new ValidationError('该战队正在用于赛程或当前比赛，请先修改相关对阵');break;}
    case 'set-schedule': {if(!Array.isArray(a.schedule)||a.schedule.length>200)throw new ValidationError('赛程数量超限');s.schedule=a.schedule.map(v=>{const m=record(v);const date=str(m.scheduledAt,60);if(!Number.isFinite(Date.parse(date)))throw new ValidationError('赛程时间无效');const blueTeamId=str(m.blueTeamId,80),redTeamId=str(m.redTeamId,80);if(blueTeamId===redTeamId||![blueTeamId,redTeamId].every(id=>s.teams.some(t=>t.id===id)))throw new ValidationError('赛程队伍无效');return {id:str(m.id,80),title:str(m.title,150),blueTeamId,redTeamId,scheduledAt:date,format:str(m.format,30),status:oneOf(m.status,['scheduled','live','finished']),blueScore:Math.floor(num(m.blueScore,0,99)),redScore:Math.floor(num(m.redScore,0,99))} satisfies Match;});if(new Set(s.schedule.map(m=>m.id)).size!==s.schedule.length)throw new ValidationError('赛程 ID 重复');break;}
    case 'set-draft': {const p=record(a.patch);for(const k of ['bluePicks','redPicks','blueBans','redBans'] as const)if(p[k]!==undefined)s.draft[k]=stringList(p[k]);if(p.bluePicks!==undefined||p.redPicks!==undefined){const picks=[...s.draft.bluePicks,...s.draft.redPicks].filter(Boolean);if(new Set(picks).size!==picks.length)throw new ValidationError('同一局英雄选择不能重复');const banned=getFearlessBans(s);if(picks.some(id=>banned.has(id)))throw new ValidationError('该英雄已在本系列赛前局选用，属于全局禁用');s.draft.locked=false;delete s.draftHistoryPending;}if(p.timer!==undefined)s.draft.timer=Math.floor(num(p.timer,0,600));if(p.activeTeam!==undefined)s.draft.activeTeam=oneOf(p.activeTeam,['blue','red']);if(p.action!==undefined)s.draft.action=str(p.action,80);if(s.phase==='live'&&(p.bluePicks!==undefined||p.redPicks!==undefined))captureManualDraft(s);break;}
    case 'select-player': {const id=a.playerId===null?null:str(a.playerId,150);if(id!==null&&!s.players.some(p=>p.id===id)&&!currentIncomeSnapshot(s)?.players.some(p=>p.playerId===id))throw new ValidationError('选手不存在');s.selectedPlayerId=id;break;}
    case 'demo-pause':if(s.mode!=='demo')throw new ValidationError('演示暂停仅适用于演示数据');s.paused=bool(a.paused);break;
    case 'demo-reset': {if(s.mode!=='demo')throw new ValidationError('当前使用真实数据，请先切换演示模式');const d=createSeed();Object.assign(s,{players:d.players,gameTime:d.gameTime,stats:d.stats,draft:d.draft,events:d.events,economy:d.economy,paused:false});s.incomeSnapshots=[...(s.incomeSnapshots??[]).filter(entry=>entry.gameKey!==incomeGameKey(s)),createDemoIncomeSnapshot(s)];break;}
    case 'save-recording':{s.recordings.unshift(snapshotRecording(s,{...(a.title?{title:str(a.title,150)}:{})}));s.recordings=s.recordings.slice(0,100);break;}
    case 'finalize-game': {const winner=a.winner===undefined||a.winner===null?undefined:oneOf(a.winner,['blue','red']as const);const previous=currentGameResult(s);if(previous?.winner&&winner&&previous.winner!==winner)throw new ValidationError('已确认的胜方不能重复改写');if(!finalizeGame(s,{source:'manual',winner}))throw new ValidationError('尚未取得本局实际样本，请先连接对局');break;}
    case 'next-game': {const result=currentGameResult(s);if(!result)throw new ValidationError('请先保存本局赛后结果');if(!result.winner)throw new ValidationError('请先确认本局胜方，再进入下一局');if(result.seriesComplete)throw new ValidationError('本系列赛已结束，请从赛程载入下一场比赛');if(s.match.game>=99)throw new ValidationError('局号已达到上限');const gate={...(result.sourceGameId?{sourceGameId:result.sourceGameId}:{}),rosterFingerprint:rosterFingerprint(result.snapshot.players),gameTime:result.snapshot.duration};result.selectedPlayerId=s.selectedPlayerId;s.match.game++;prepareMatch(s);s.reportGameId=result.id;s.awaitingNextGame=gate;s.previewScene='draft';break;}
    case 'load-match': {const m=s.schedule.find(m=>m.id===a.matchId);if(!m)throw new ValidationError('赛程不存在');Object.assign(s.match,{title:m.title,subtitle:'',blueTeamId:m.blueTeamId,redTeamId:m.redTeamId,format:m.format,blueScore:m.blueScore,redScore:m.redScore,game:1});startDraftSeries(s,`${s.mode}:schedule:${m.id}`);prepareMatch(s);const latest=s.gameResults?.filter(result=>result.seriesId===s.match.seriesId&&result.snapshot.mode===s.mode).sort((a,b)=>b.game-a.game)[0];if(latest){s.match=structuredClone(latest.match);s.finishedGameId=latest.id;s.reportGameId=latest.id;Object.assign(s,frozenGameState(s));}break;}
    default:throw new ValidationError('未知操作');
  }
  s.revision=current.revision+1;return s;
}
export function tickDemo(s:BroadcastState):void {
  if(s.mode!=='demo'||s.paused)return;
  if(s.phase==='draft'){s.draft.timer=s.draft.timer>0?s.draft.timer-1:30;return;}
  if(s.phase!=='live')return;
  s.gameTime+=1;
  for(const [index,p]of s.players.entries()){if(p.gold!==null)p.gold+=p.role==='辅助'?4:7;if(s.gameTime%8===0&&p.role!=='辅助')p.cs+=1;
    if(p.isDead){p.respawnTimer=Math.max(0,(p.respawnTimer??0)-1);if(p.respawnTimer===0)p.isDead=false;}
    if(p.maxHealth!==undefined)p.health=p.isDead?0:Math.round(p.maxHealth*(.64+.27*Math.sin(s.gameTime/13+index*.8)));
    if(p.maxResource!==undefined)p.resource=Math.round(p.maxResource*(.57+.33*Math.cos(s.gameTime/17+index*.7)));
  }
  s.stats.blue.gold=s.players.filter(p=>p.team==='blue').reduce((v,p)=>v+(p.gold??0),0);s.stats.red.gold=s.players.filter(p=>p.team==='red').reduce((v,p)=>v+(p.gold??0),0);
  if(s.gameTime%15===0)s.economy.push({time:s.gameTime,blue:s.stats.blue.gold,red:s.stats.red.gold});s.economy=s.economy.slice(-1200);
  if(s.gameTime%65===0){const side=s.gameTime%130===0?'red':'blue';const killer=s.players.find(p=>p.team===side&&p.role==='中单');const victim=s.players.find(p=>p.team!==side&&p.role==='辅助');if(killer&&victim){killer.kills++;victim.deaths++;victim.isDead=true;victim.respawnTimer=12;victim.health=0;s.stats[side].kills++;s.events.push({id:`demo-${s.gameTime}`,time:s.gameTime,type:'ChampionKill',text:`${killer.name} 击杀 ${victim.name}`,team:side});s.events=s.events.slice(-300);}}
  updateIncomeSnapshots(s);
}
export function publicState(state:BroadcastState):BroadcastState {const result=structuredClone(state);delete result.settings.obsPassword;return result;}
export function csvRecording(r:Recording):string {
  const quote=(value:unknown)=>{let t=String(value??'');if(/^[=+@\-\t\r]/.test(t))t=`'${t}`;return `"${t.replaceAll('"','""')}"`;};
  const sources={none:'不可用',api:'游戏 API',manual:'人工校准',ocr:'观战 HUD 识别'};
  const source=r.mode==='demo'?'演示':sources[r.economyFeed?.source??'none'];
  const rows:unknown[][]=[['数据来源',r.mode==='demo'?'演示':'真实'],['实际采样时间',r.observedAt??'未记录'],['实际游戏秒数',r.sourceGameTime??r.duration],['队伍','选手','位置','英雄','击杀','死亡','助攻','补刀','等级','个人累计经济','个人经济来源','个人经济采样时间','当前金币','KDA / 补刀来源','KDA / 补刀采样时间','个人经济对应游戏秒数','KDA / 补刀对应游戏秒数'],...r.players.map(p=>[p.team,p.name,p.role,p.championName,p.kills,p.deaths,p.assists,p.cs,p.level,p.gold??'不可用',r.mode==='demo'?'演示':p.goldSource==='api'?'游戏 API':p.goldSource==='ocr'?'观战 HUD 识别':'不可用',p.goldSampledAt??'',p.currentGold??'不可用',r.mode==='demo'?'演示':p.statsSource==='api'?'游戏 API':p.statsSource==='ocr'?'观战 HUD 识别':'未记录',p.statsSampledAt??'',p.goldGameTime??'',p.statsGameTime??'']),[],['团队','团队累计经济','经济来源'],['blue',r.stats.blue.gold??'不可用',source],['red',r.stats.red.gold??'不可用',source],[],['比赛秒数','蓝方经济','红方经济','采样来源'],...r.economy.map(p=>[p.time,p.blue,p.red,r.mode==='demo'?'演示':sources[p.source??'none']])];
  const incomeSources={api:'兼容游戏 API',telemetry:'赛事数据桥',demo:'演示',unavailable:'未提供'};
  for(const snapshot of r.incomeSnapshots??[]){rows.push([],['十分钟经济来源','目标秒数',snapshot.targetTime,'实际采样秒数',snapshot.capturedTime,'数据来源',snapshot.mode==='demo'?'演示':'真实','状态',snapshot.status],['队伍','选手','位置','英雄','十分钟个人累计经济',...incomeCategories.flatMap(key=>[incomeCategoryLabels[key],`${incomeCategoryLabels[key]}来源`])]);for(const player of snapshot.players)rows.push([player.team,player.name,player.role,player.championId,player.totalGold??'未提供',...incomeCategories.flatMap(key=>[player.values[key].value??'未提供',incomeSources[player.values[key].source]])]);}
  return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
