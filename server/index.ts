import { mountResourceMaintenanceRoutes } from './resource-maintenance';
import { syncPowerPlay } from '../shared/power-play';
import { mountVdoNinjaRoutes } from './vdo-ninja';
import { EventTransitionRules, defaultTransitionSettings, validateTransitionSettings, type TransitionConfig } from '../shared/broadcast-transitions';
import { mountTwitchAudienceRoutes } from './twitch-audience';
import { IntegrationHub, registerIntegrationRoutes } from './integrations';
import { registerCinematicRoutes } from './cinematics';
import { tournamentReport, tournamentCsv } from '../shared/tournament-report';
import { exportTournament } from './tournament-export';
import { PostgameArchiveStore, PostgameCollector } from './postgame-archive';
import {reconcileArchivedFrame} from './game-results';
import { syncFightSegment } from '../shared/combat-display';
import { clientPollScheduler } from './client-poll';
import { StylePackStore } from './style-packs';
import { stylePackDeleteBlock } from '../shared/style-pack-usage';
import { BUILTIN_STYLE_REF, STYLE_PACK_MAX_BYTES, styleRef } from '../shared/style-packs';
import express from 'express';
import multer from 'multer';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BroadcastState, Recording } from '../shared/types';
import { Adapters, ChampionCatalog, localJson } from './adapters';
import { applyAction, createSeed, csvRecording, normalizeSavedState, publicState, record, resetRuntimeState, snapshotRecording, ValidationError, scenes } from './state';
import { inspectImage, isLoopback, lanAddresses, validHost, validOrigin, validToken } from './security';
import { EconomyBridge } from './economy';
import { closeSpectatorOcrWorker } from './spectator-ocr-worker';
import { tickPlayerFeeds } from '../shared/player-feeds';
import { NativeHudController } from './native-hud';
import { ObsPreviewStream } from './obs-preview-stream';
import { currentGameResult, frozenGameState } from '../shared/game-results';
import { ensureProduction, preserveProgram, programState, publishProgram, productionKey } from '../shared/production';
import { ControlSeats } from './control-seats';
import { writeDurableState } from './durable-state';
import { ResourceCache } from './resource-cache';
import { audit } from './production';
import { resourceInventory } from './resource-inventory';
import { version as appVersion } from '../package.json';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.RIFTCAST_DATA_DIR?path.resolve(process.env.RIFTCAST_DATA_DIR):path.join(root,'data');
const uploadDir=path.join(dataDir,'uploads');const stateFile=path.join(dataDir,'state.json');
const port=Number(process.env.PORT??3888);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 需为有效端口');
const lan=process.env.ENABLE_LAN==='1';const controlToken=randomBytes(18).toString('base64url');
await mkdir(uploadDir,{recursive:true});
let state=createSeed();
try{const saved=JSON.parse(await readFile(stateFile,'utf8'))as BroadcastState;if(saved&&saved.match&&saved.overlay&&saved.settings&&Array.isArray(saved.players)&&Array.isArray(saved.teams)&&['demo','live'].includes(saved.mode))state=normalizeSavedState(saved);}catch{/* first run waits for local client samples */}
const stylePacks=new StylePackStore(path.join(dataDir,'style-packs'));
await stylePacks.initialize();
for(const overlay of [state.overlay,state.production?.program?.overlay,state.production?.previousProgram?.content.overlay]){
  if(!overlay)continue;
  try{const pack=stylePacks.get(styleRef(overlay.stylePack));overlay.stylePack={id:pack.id,revision:pack.revision,name:pack.name};}
  catch{stylePacks.warnings.push('已保存的风格包暂不可用，已回退到冰川极光');overlay.stylePack={...BUILTIN_STYLE_REF};}
}
resetRuntimeState(state);
delete ensureProduction(state).control;
const seats=new ControlSeats();
const integrations=new IntegrationHub(dataDir,()=>state);await integrations.initialize();
const app=express();const server=http.createServer(app);const wss=new WebSocketServer({noServer:true,maxPayload:4096});let writeTimer:ReturnType<typeof setTimeout>|undefined;let dirty=false;let pendingWrite:Promise<void>|undefined;let shuttingDown=false;
function persist():Promise<void>{
  dirty=true;if(pendingWrite)return pendingWrite;
  pendingWrite=(async()=>{try{while(dirty){
    dirty=false;const revision=state.revision;
    ensureProduction(state).persistence={status:'saving',at:new Date().toISOString(),revision};
    try{
      const value=publicState(state);ensureProduction(value).persistence={status:'saved',at:new Date().toISOString(),revision};
      await writeDurableState(stateFile,value);
      ensureProduction(state).persistence={status:'saved',at:new Date().toISOString(),revision};
    }catch{
      ensureProduction(state).persistence={status:'failed',at:new Date().toISOString(),revision,detail:'状态文件保存失败，请检查数据目录与磁盘空间'};
      broadcast(false);throw new Error('状态文件保存失败，请检查数据目录与磁盘空间');
    }
  }}finally{pendingWrite=undefined;}})();return pendingWrite;
}

function broadcast(scheduleWrite=true){if(shuttingDown)return;syncFightSegment(state);syncPowerPlay(state);integrations.observe();void adapters.syncPlayerFeeds().catch(()=>{});const value=JSON.stringify(publicState(state));for(const socket of wss.clients)if(socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>1024*1024)socket.close(1013,'客户端接收速度过慢');else socket.send(value);}if(scheduleWrite){if(writeTimer)clearTimeout(writeTimer);writeTimer=setTimeout(()=>{void persist().catch(()=>{});},250);}}
function commit(work:(s:BroadcastState)=>void){if(shuttingDown)return;const beforeResult=currentGameResult(state),beforeWinner=beforeResult?.winner,beforeTerminal=beforeResult?.terminalSampleAccepted;work(state);reconcileArchivedFrame(state);state.revision++;broadcast();const afterResult=currentGameResult(state);if(afterResult&&(afterResult.id!==beforeResult?.id||afterResult.winner!==beforeWinner||afterResult.terminalSampleAccepted!==beforeTerminal))void persist().catch(()=>{});}
const economy:EconomyBridge=new EconomyBridge(()=>state,commit,{goldSource:'direct',frame:():Promise<Buffer>=>adapters.spectatorFrame()});state.economyFeed=economy.status();
const catalog=new ChampionCatalog(dataDir);const archiveStore=new PostgameArchiveStore(path.join(dataDir,'match-archives'));const archives=new PostgameCollector(archiveStore,()=>state,commit,()=>catalog.champions);const adapters:Adapters=new Adapters(()=>state,commit,catalog,undefined,economy,archives);void catalog.load();
const resources=new ResourceCache(path.join(dataDir,'resources'));
await adapters.initializeObsEngine({root,dataDir,overlayUrl:`http://127.0.0.1:${port}/overlay`});
const monitorWss=new WebSocketServer({noServer:true,maxPayload:64,perMessageDeflate:false});
const monitorStream=new ObsPreviewStream(kind=>adapters.obsEngineLiveFrame(kind));
const nativeHud=new NativeHudController(()=>programState(state),commit,localJson);
function connectGameSources(){if(process.env.RIFTCAST_AUTO_CONNECT==='0')return;void Promise.allSettled((['lcu','live','replay']as const).map(target=>adapters.connect(target)));}
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  if(shuttingDown){res.status(503).json({error:'本地服务正在保存数据并关闭'});return;}
  if(!validHost(req.headers.host,port,lan)){res.status(403).json({error:'请求主机不在允许列表中'});return;}
  const externalData=['/api/integrations/data','/api/integrations/stream','/riftcast-client.js'].includes(req.path)&&['GET','OPTIONS'].includes(req.method)&&integrations.allowsOrigin(req.headers.origin);
  if(externalData){res.setHeader('Access-Control-Allow-Origin',String(req.headers.origin));res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');if(req.method==='OPTIONS'){res.status(204).end();return;}}
  if(!externalData&&!validOrigin(req.headers.origin,port,lan)){res.status(403).json({error:'请求来源不在允许列表中'});return;}
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!isLoopback(req.socket.remoteAddress)&&!validToken(req.headers['x-control-token']??req.query.token,controlToken)){res.status(401).json({error:'需要手机控制配对令牌'});return;}
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!isLoopback(req.socket.remoteAddress)&&req.path!=='/api/control/seat'&&!seats.resolve(req.headers['x-seat-token'])){res.status(403).json({error:'请先连接已授权的操作席位'});return;}
  next();
});
app.use(express.json({limit:'512kb'}));
app.get('/api/health',(_req,res)=>res.json({service:'riftcast-director',version:appVersion,status:'ok',mode:state.mode,lanEnabled:lan}));
app.get('/api/obs/cameras',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'摄像头源仅支持在导播主机读取'});return;}res.json(await adapters.obsCameraDevices());});
app.post('/api/obs/player-feeds',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'选手摄像头仅支持在导播主机应用'});return;}seats.authorize(req.headers['x-seat-token'],'output');res.json(await adapters.syncPlayerFeeds(true));});
app.get('/api/state',(_req,res)=>res.json(publicState(state)));
let actionQueue:Promise<unknown>=Promise.resolve();
async function applyProgramme(candidate:BroadcastState,transition?:TransitionConfig){
  const application=ensureProduction(candidate).application;
  ensureProduction(state).application=structuredClone(application);state.revision++;broadcast();
  try{
    if(transition){
      const receipt=await adapters.productionTransition(transition,candidate,()=>{publishProgram(state,candidate);state.revision++;broadcast();});
      state.transitionReceipt=receipt;
      ensureProduction(state).application={...application,version:application?.version??0,status:receipt.status,at:receipt.endedAt,detail:receipt.detail};
      if(!receipt.published)await adapters.syncPlayerFeeds(true).catch(()=>{});
    }else{
      await adapters.productionApply(true,candidate);
      if(application)ensureProduction(candidate).application={...application,status:'applied',detail:'OBS 来源已应用，请核对节目画面'};
      publishProgram(state,candidate);
    }
  }catch(error){
    ensureProduction(state).application={...application,version:application?.version??0,status:'failed',at:new Date().toISOString(),detail:error instanceof Error?error.message:'OBS 应用失败，请核对节目画面'};
    await adapters.syncPlayerFeeds(true).catch(()=>{});
  }
  state.revision++;broadcast();
}
const eventTransitions=new EventTransitionRules();let automaticTransitionBusy=false;
function tickAutomaticTransitions(){
  const settings=state.broadcastTransitions??defaultTransitionSettings(),trigger=eventTransitions.observe(state,settings);
  if(!trigger||automaticTransitionBusy||state.connections.obs.status!=='connected')return;
  automaticTransitionBusy=true;const triggerKey=productionKey(state),triggerVersion=ensureProduction(state).configVersion,triggerClock=JSON.stringify([state.gameClock?.sessionId,state.gameClock?.discontinuity]),triggerTime=state.gameTime,queuedAt=Date.now();
  const run=actionQueue.catch(()=>{}).then(async()=>{
    const latest=state.broadcastTransitions;
    if(Date.now()-queuedAt>5000||state.gameTime<triggerTime-.5||JSON.stringify([state.gameClock?.sessionId,state.gameClock?.discontinuity])!==triggerClock||state.gameClock?.awaitingLiveSample||state.replayReview||state.production?.playingClipId||state.production?.application?.status==='requested'||productionKey(state)!==triggerKey||ensureProduction(state).configVersion!==triggerVersion||!latest?.automatic||!latest.rules.some(r=>r.id===trigger.ruleId&&r.enabled)||state.connections.obs.status!=='connected'||state.programScene===trigger.targetScene)return;
    const candidate=applyAction(state,{type:'take',scene:trigger.targetScene});
    audit(candidate,'event-transition','事件转场规则',`${trigger.ruleId} · ${trigger.eventId}`);
    await applyProgramme(candidate,trigger.transition);await persist();
  }).catch(error=>{ensureProduction(state).alerts??=[];ensureProduction(state).alerts!.push({id:randomUUID(),text:error instanceof Error?error.message:'事件转场失败',category:'transition',at:new Date().toISOString()});broadcast();}).finally(()=>{automaticTransitionBusy=false;});
  actionQueue=run;
}
app.get('/api/transitions',(_req,res)=>res.json({settings:state.broadcastTransitions??defaultTransitionSettings(),receipt:state.transitionReceipt}));
app.post('/api/transitions',async(req,res,next)=>{
  const run=actionQueue.catch(()=>{}).then(async()=>{
    seats.authorize(req.headers['x-seat-token'],'output');
    let settings;try{settings=validateTransitionSettings(req.body,[...scenes,...(state.customScenes??[]).map(s=>s.id)]);}catch(error){throw new ValidationError(error instanceof Error?error.message:'转场配置无效');}
    commit(s=>{s.broadcastTransitions=settings;ensureProduction(s).configVersion++;audit(s,'transition-settings','主导播');});await persist();res.json({settings,receipt:state.transitionReceipt});
  });actionQueue=run;try{await run;}catch(error){next(error);}
});
app.get('/api/control/seat',(req,res)=>{
  try { res.json(seats.verify(req.headers['x-seat-token'])); }
  catch { res.status(401).json({code:'SEAT_EXPIRED',error:'操作席位已失效，请重新连接操作席位'}); }
});
app.post('/api/control/seat',(req,res)=>{const seat=seats.issue(req.body,isLoopback(req.socket.remoteAddress),req.headers['x-seat-token']);const owner=seats.ownerInfo();if(owner)ensureProduction(state).control={owner:owner.id,name:owner.name};res.json(seat);});
app.post('/api/control/invite',(req,res)=>{if(!isLoopback(req.socket.remoteAddress))throw new ValidationError('邀请操作席位请由主机导播发起');seats.authorize(req.headers['x-seat-token'],'engine');const seat=seats.issue({...record(req.body),fresh:true},true);const address=lanAddresses()[0];res.json({...seat,url:lan&&address?`http://${address}:${port}/remote?token=${encodeURIComponent(controlToken)}&seat=${encodeURIComponent(String(seat.token))}`:undefined});});
app.post('/api/control/claim',async(req,res,next)=>{const run=actionQueue.catch(()=>{}).then(async()=>{const body=record(req.body);const control=seats.claim(req.headers['x-seat-token'],body.reason);commit(s=>{ensureProduction(s).control=control;audit(s,'claim-control',control.name,String(body.reason));});await persist();res.json(control);});actionQueue=run;try{await run;}catch(error){next(error);}});
app.use('/api',(req,_res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method)||req.path.startsWith('/control/')||req.path==='/action'||req.path==='/obs/engine/monitor'&&isLoopback(req.socket.remoteAddress)){next();return;}const type=(req.path==='/replay'||req.path==='/replay/director')?'replay':req.path.startsWith('/obs/production')?'obs-production':req.path.startsWith('/obs/')?'engine':req.path.startsWith('/assets')?'set-teams':req.path.startsWith('/economy')?'set-settings':'engine';seats.authorize(req.headers['x-seat-token'],type);if(req.path==='/replay/director')seats.authorize(req.headers['x-seat-token'],'output');if(type==='obs-production'&&['play-clip','emergency','return-live','audio','tracks','start-buffer','stop-buffer'].includes(String(req.body?.action)))seats.authorize(req.headers['x-seat-token'],'output');next();});
app.post('/api/action',async(req,res,next)=>{
  const run=actionQueue.catch(()=>{}).then(async()=>{
    const action=record(req.body),type=String(action.type),command=type==='production'?record(action.command):undefined;
    const seat=seats.authorize(req.headers['x-seat-token'],type,command);
    if(seat.role==='subtitle'&&(type!=='set-overlay'||Object.keys(record(action.patch)).some(k=>!['ticker','tickerText'].includes(k))))throw new ValidationError('字幕席仅可编辑待播字幕');
    if(type==='set-match'&&['game','seriesId','blueTeamId','redTeamId'].some(k=>record(action.patch)[k]!==undefined))seats.authorize(req.headers['x-seat-token'],'load-match');
    const fingerprint=JSON.stringify(action);
    if(seats.duplicate(seat.id,action.requestId,fingerprint)){await persist();res.json(publicState(state));return;}
    if(seat.id!=='local'&&(!Number.isInteger(action.expectedConfigVersion)||typeof action.requestId!=='string'||!action.requestId))throw new ValidationError('请携带预期配置版本与请求 ID，刷新操作席位后重试');
    if(action.expectedConfigVersion!==undefined&&action.expectedConfigVersion!==ensureProduction(state).configVersion){res.status(409).json({error:'配置已被其他席位修改，请核对最新版本后重新保存',version:state.production!.configVersion});return;}
    if(!isLoopback(req.socket.remoteAddress)&&type==='set-settings')throw new ValidationError('连接设置仅支持在导播主机修改');
    const previousDynamic=state.production?.dynamicPreview,previousMode=state.mode,previousProgramScene=state.programScene;
    const applies=type==='take'||type==='production'&&command?.op==='immediate';
    if(applies&&state.connections.obs.status!=='connected')throw new ValidationError('请先连接 OBS，再核对预监后切入');
    let installedStyle;
    if(type==='set-style-pack'){try{const pack=stylePacks.get({id:String(action.id),revision:String(action.revision),name:'lookup'});installedStyle={id:pack.id,revision:pack.revision,name:pack.name};}catch(e){throw new ValidationError(e instanceof Error?e.message:'风格包不可用');}}
    const nextState=applyAction(state,action,installedStyle),p=ensureProduction(nextState);
    if(type==='set-settings'){const patch=record(action.patch);if(patch.obsPassword!==undefined)adapters.setPassword(String(patch.obsPassword));}
    if(p.audit.at(-1))p.audit.at(-1)!.actor=seat.name;
    if(type==='production'&&command?.op==='check'){const check=p.checks[command.id as keyof typeof p.checks];if(check)check.actor=seat.name;}
    if(type==='correct-result'&&p.corrections.at(-1))p.corrections.at(-1)!.actor=seat.name;
    const cadence=type==='production'&&command?.op==='settings';
    if(applies&&state.connections.obs.status==='connected'){
      await applyProgramme(nextState,state.broadcastTransitions?.default);
    }else{
      state=nextState;broadcast();
      if(cadence&&state.connections.obs.status==='connected'){
        try{await adapters.productionApply(false);}
        catch{ensureProduction(state).dynamicPreview=previousDynamic??false;throw new ValidationError('预监设置应用失败，请核对 OBS 引擎后重试');}
      }
    }
    seats.remember(seat.id,action.requestId,fingerprint,ensureProduction(state).configVersion);
    await persist();res.json(publicState(state));
    if(previousProgramScene!==state.programScene||type==='take'||type==='production')void nativeHud.tick(true);
    if(previousMode!=='live'&&state.mode==='live')connectGameSources();
  });
  actionQueue=run;try{await run;}catch(e){next(e);}
});
app.get('/api/champions',async(_req,res)=>{await catalog.load();res.json({version:catalog.version,champions:catalog.champions});});
app.post('/api/connect',async(req,res)=>{const target=record(req.body).target;if(!['lcu','live','replay','obs'].includes(String(target)))throw new ValidationError('连接目标无效');if(target==='obs'&&!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'输出引擎仅支持在导播主机连接'});return;}await adapters.connect(target as 'lcu');res.json(publicState(state));});
app.get('/api/replay/director',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await adapters.replayDirector());});
app.post('/api/replay/director',async(req,res)=>res.json(await adapters.controlReplayDirector(req.body)));
app.post('/api/replay',async(req,res)=>res.json(await adapters.replay(req.body)));
app.get('/api/replay/diagnostics',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await adapters.replayDiagnostics());});
app.post('/api/replay/hud',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'原生 HUD 控制仅支持在导播主机应用'});return;}await nativeHud.tick(true);res.json(state.nativeHudStatus);});
app.get('/api/economy/status',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(economy.status());});
app.use('/api/economy', (req,res,next)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'观战经济采集仅支持在导播主机配置'});return;}next();});
app.post('/api/economy/config',(req,res)=>res.json(economy.configure(req.body)));
app.post('/api/economy/sample',(req,res)=>res.json(economy.sample(req.body)));
app.post('/api/economy/probe',async(req,res)=>{const body=record(req.body??{});const delay=body.delayMs??0;if(typeof delay!=='number'||!Number.isInteger(delay)||delay<0||delay>5000)throw new ValidationError('识别延时需在 0–5000 毫秒范围');if(delay)await new Promise(resolve=>setTimeout(resolve,delay));res.json(await economy.probe());});
app.post('/api/economy/calibrate',async(req,res)=>{const body=record(req.body??{});const delay=body.delayMs??3000;if(typeof delay!=='number'||!Number.isInteger(delay)||delay<0||delay>5000)throw new ValidationError('定位延时需在 0–5000 毫秒范围');if(delay)await new Promise(resolve=>setTimeout(resolve,delay));res.json(await economy.autoCalibrate());});
app.get('/api/obs/custom-sources',async(req,res)=>{res.setHeader('Cache-Control','no-store');if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'应用窗口仅支持在导播主机读取'});return;}res.json(await adapters.customSourceChoices());});
app.get('/api/obs/scenes',async(_req,res)=>res.json(await adapters.obsScenes()));
app.post('/api/obs/scene',async(req,res)=>res.json(await adapters.obsScene(req.body)));
app.get('/api/obs/stream/status',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await adapters.obsStreamStatus());});
app.post('/api/obs/stream/settings',async(req,res)=>{res.setHeader('Cache-Control','no-store');if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'推流配置仅支持在导播主机修改'});return;}res.json(await adapters.obsStreamSettings(req.body));});
app.post('/api/obs/hud',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'OBS 来源仅支持在导播主机添加'});return;}res.json(await adapters.obsHud(req.body,`http://127.0.0.1:${port}/overlay`));});
app.use('/api/obs/engine',(req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'内置输出引擎仅支持在导播主机管理'});return;}next();});
app.get('/api/obs/engine',async(_req,res)=>res.json(await adapters.obsEngineStatus()));
app.post('/api/obs/engine/start',async(_req,res)=>res.json(await adapters.obsEngineStart()));
app.post('/api/obs/engine/mode',async(req,res)=>res.json(await adapters.obsEngineMode(req.body)));
app.post('/api/obs/engine/destination',async(req,res)=>res.json(await adapters.obsEngineDestination(req.body)));
app.post('/api/obs/engine/virtual-camera/install',async(_req,res)=>res.json(await adapters.obsEngineInstallVirtualCamera()));
app.post('/api/obs/engine/companion/prepare',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress))throw new ValidationError('音画设备准备请在导播主机操作');res.json(await adapters.obsEnginePrepareCompanion(req.body));});
const musicUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:32*1024*1024,files:1,fields:0}});
app.post('/api/obs/music',musicUpload.single('file'),async(req,res)=>{if(!isLoopback(req.socket.remoteAddress))throw new ValidationError('节目音乐请在导播主机操作');if(!req.file)throw new ValidationError('请选择音乐文件');res.status(201).json(await adapters.obsMusicImport(req.file.buffer,req.file.originalname));});
app.post('/api/obs/music/control',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress))throw new ValidationError('节目音乐请在导播主机操作');res.json(await adapters.obsMusicControl(req.body));});
app.post('/api/obs/engine/setup',async(req,res)=>res.json(await adapters.obsEngineSetup(req.body)));
app.get('/api/obs/engine/preview',async(_req,res)=>res.json(await adapters.obsEnginePreview()));
app.post('/api/obs/engine/monitor',async(req,res)=>res.json(await adapters.obsEngineMonitor(req.body)));
app.post('/api/obs/engine/output',async(req,res)=>{const result=await adapters.obsEngineOutput(req.body);await persist();res.json(result);});
app.get('/api/obs/production',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await adapters.productionStatus());});
app.post('/api/obs/production',async(req,res,next)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'制作引擎仅支持在导播主机操作'});return;}const run=actionQueue.catch(()=>{}).then(async()=>{seats.authorize(req.headers['x-seat-token'],'obs-production');if(['play-clip','emergency','return-live','audio','tracks','start-buffer','stop-buffer'].includes(String(req.body?.action)))seats.authorize(req.headers['x-seat-token'],'output');const result=await adapters.productionControl(req.body);await persist();res.json(result);});actionQueue=run;try{await run;}catch(error){next(error);}});
app.get('/api/obs/game-frame',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).end();return;}res.setHeader('Cache-Control','no-store');res.type('png').send(await adapters.spectatorFrame());});
app.get('/api/tournaments/:id/export',async(req,res)=>{
  const snapshot=structuredClone(state),t=snapshot.tournaments?.find(t=>t.id===req.params.id);if(!t)throw new ValidationError('赛事不存在');
  const format=req.query.format??'zip';if(!['zip','json','csv'].includes(String(format)))throw new ValidationError('导出格式需为 zip、json 或 csv');
  if(format==='zip'){await exportTournament(snapshot,t,archiveStore,uploadDir,res);return;}
  res.setHeader('Content-Disposition',`attachment; filename="${t.id}.${format}"`);
  if(format==='csv'){res.type('text/csv; charset=utf-8').send(tournamentCsv(snapshot,t));return;}
  const report=tournamentReport(snapshot,t),raw:Record<string,unknown>={};for(const r of [...report.results,...report.invalidAttempts.flatMap(a=>a.result?[a.result]:[])])raw[r.id]=await archiveStore.all(r.id);
  res.json({schemaVersion:1,exportedAt:new Date().toISOString(),tournament:t,...report,raw});
});
app.get('/api/game-archives/:id',async(req,res)=>{const result=state.gameResults?.find(r=>r.id===req.params.id)??state.production?.invalidAttempts.find(a=>a.result?.id===req.params.id)?.result;if(!result)throw new ValidationError('比赛记录不存在');res.setHeader('Content-Disposition',`attachment; filename="${result.id}.json"`);res.json({schemaVersion:1,result,raw:await archiveStore.all(result.id)});});
app.get('/api/archive',(_req,res)=>{res.setHeader('Content-Disposition','attachment; filename="riftcast-event-package.json"');res.json({version:'0.3.0',exportedAt:new Date().toISOString(),match:state.match,teams:state.teams,schedule:state.schedule,results:state.gameResults,tournaments:state.tournaments,recordings:state.recordings,production:state.production});});
app.get('/api/clips/:id/file',(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).end();return;}const clip=state.production?.clips.find(c=>c.id===req.params.id);if(!clip)throw new ValidationError('片段不存在');res.sendFile(path.resolve(clip.file));});
app.get('/api/videos/:id/file',(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).end();return;}const video=state.production?.videos.find(v=>v.id===req.params.id&&v.file);if(!video)throw new ValidationError('录像文件待确认');res.download(path.resolve(video.file));});
mountResourceMaintenanceRoutes(app,{cache:resources,authorize:req=>{if(!isLoopback(req.socket.remoteAddress))throw new ValidationError('资源维护仅支持导播主机');seats.authorize(req.headers['x-seat-token'],'output');},beforeMutation:async()=>{if(state.connections.obs.status==='connected'){const output=await adapters.obsEngineStatus();if(output.streamActive||output.recordActive||output.virtualCamActive===true)throw new ValidationError('资源维护请安排在停播窗口');}},getGameVersion:()=>state.production?.versions.game||'',getProtectedVersions:()=>[state.production?.versions.resources||'',state.production?.program?.versions.resources||''].filter(Boolean)});
app.get('/api/resources/inventory',async(_req,res)=>res.json(await resourceInventory(root,dataDir,state)));
app.get('/api/resources/asset',async(req,res)=>{const resource=await resources.read(req.query.url,process.env.RIFTCAST_OFFLINE==='1');res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.type(resource.type).send(resource.bytes);});
app.post('/api/resources/cache',async(req,res)=>{seats.authorize(req.headers['x-seat-token'],'output');if(!isLoopback(req.socket.remoteAddress))throw new ValidationError('素材准备仅支持主机维护');if(state.connections.obs.status==='connected'){const output=await adapters.obsEngineStatus();if(output.streamActive||output.recordActive||output.virtualCamActive===true)throw new ValidationError('离线素材更新请安排在停播窗口');}seats.authorize(req.headers['x-seat-token'],'output');res.json(await resources.prepare(String(record(req.body).version)));});
app.get('/api/network',(req,res)=>{res.setHeader('Cache-Control','no-store');res.json({enabled:lan,urls:lan?lanAddresses().map(address=>`http://${address}:${port}/remote`):[],...(isLoopback(req.socket.remoteAddress)?{controlToken}:{}),message:lan?'手机与主机需连接同一局域网':'以 ENABLE_LAN=1 启动服务后可开启手机控制'});});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:4},fileFilter:(_req,file,cb)=>{if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.mimetype)){cb(new ValidationError('仅支持 PNG、JPEG、WebP、GIF 图片'));return;}cb(null,true);}});
app.post('/api/assets',upload.single('file'),async(req,res)=>{if(!req.file)throw new ValidationError('请选择图片文件');const info=inspectImage(req.file.buffer);if(req.file.mimetype!==info.mime)throw new ValidationError('图片签名与文件类型不符');const id=randomUUID();const file=`${id}.${info.extension}`;await writeFile(path.join(uploadDir,file),req.file.buffer);const asset={id,name:path.basename(req.file.originalname.replaceAll('\\','/')).slice(0,100),url:`/uploads/${file}`,type:info.mime,width:info.width,height:info.height,category:['logo','player','sponsor','other'].includes(req.body.category)?req.body.category:'other',createdAt:new Date().toISOString()};commit(s=>{s.assets.unshift(asset);s.assets=s.assets.slice(0,1000);});res.status(201).json(asset);});
app.use('/uploads',express.static(uploadDir,{index:false,dotfiles:'deny',maxAge:'1d',setHeaders:res=>res.setHeader('Content-Security-Policy',"default-src 'none'")}));
app.get('/api/export',(req,res)=>{const format=req.query.format??'json';if(!['json','csv'].includes(String(format)))throw new ValidationError('导出格式需为 json 或 csv');let recording:Recording|undefined;if(req.query.recordingId){recording=state.recordings.find(r=>r.id===req.query.recordingId)??state.gameResults?.find(r=>r.snapshot.id===req.query.recordingId)?.snapshot??state.production?.invalidAttempts.find(r=>r.result?.snapshot.id===req.query.recordingId)?.result?.snapshot;if(!recording)throw new ValidationError('记录不存在');}else recording=snapshotRecording(state,{id:'current',title:state.match.title});res.setHeader('Content-Disposition',`attachment; filename="riftcast-${recording.id.replace(/[^a-z0-9-]/gi,'')}.${format}"`);if(format==='csv'){res.type('text/csv; charset=utf-8').send(csvRecording(recording));return;}res.json(recording);});
// Immutable, independently cached art assets are kept out of high-frequency state broadcasts.
app.get('/api/style-packs',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({packs:stylePacks.list(),warnings:stylePacks.warnings});});
const packRef=(req:express.Request)=>({id:String(req.params.id),revision:String(req.params.revision),name:'lookup'});
app.delete('/api/style-packs/:id/:revision',async(req,res,next)=>{
  // Serialize with TAKE, undo, staging and control claims; recheck live references inside the queue.
  const run=actionQueue.catch(()=>{}).then(async()=>{
    seats.authorize(req.headers['x-seat-token'],'engine');
    const ref=packRef(req);
    try{stylePacks.get(ref);}catch(e){throw new ValidationError(e instanceof Error?e.message:'风格包不可用');}
    const reason=stylePackDeleteBlock(state,ref);
    if(reason){res.status(409).json({error:reason});return;}
    await stylePacks.remove(ref);
    res.setHeader('Cache-Control','no-store');res.json({packs:stylePacks.list(),warnings:stylePacks.warnings});
  });
  actionQueue=run;try{await run;}catch(error){next(error);}
});
app.post('/api/style-packs/:id/:revision/derive',async(req,res)=>{seats.authorize(req.headers['x-seat-token'],'set-style-pack');res.json(await stylePacks.derive(packRef(req),req.body));});
app.get('/api/style-packs/:id/:revision/assets/:asset',async(req,res)=>{try{const bytes=await stylePacks.asset(packRef(req),String(req.params.asset));res.setHeader('Cache-Control','public,max-age=31536000,immutable');res.setHeader('Content-Security-Policy',"default-src 'none'");res.type('image/png').send(bytes);}catch{res.status(404).json({error:'贴图不存在或已损坏'});}});
app.get('/api/style-packs/:id/:revision/export',async(req,res)=>{try{const ref=packRef(req),bytes=await stylePacks.export(ref);res.setHeader('Content-Disposition',`attachment; filename="${ref.id}.riftstyle.zip"`);res.type('application/zip').send(bytes);}catch(e){throw new ValidationError(e instanceof Error?e.message:'风格包不可用');}});
app.get('/api/style-packs/:id/:revision',(req,res)=>{try{res.setHeader('Cache-Control','public,max-age=31536000,immutable');res.json(stylePacks.get(packRef(req)));}catch{res.status(404).json({error:'风格包不存在或已损坏'});}});
const styleUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:STYLE_PACK_MAX_BYTES,files:1,fields:0,parts:2}});
let styleUploadBusy=false;
app.post('/api/style-packs/import',(req,res,next)=>{if(styleUploadBusy){res.status(409).json({error:'已有风格包正在导入'});return;}styleUploadBusy=true;res.once('close',()=>{styleUploadBusy=false;});next();},styleUpload.single('file'),async(req,res)=>{
  if(!req.file)throw new ValidationError('请选择 .riftstyle.zip 或 .zip 风格包');
  try{const pack=await stylePacks.import(req.file.buffer);res.status(201).json(pack);}catch(e){throw new ValidationError(e instanceof Error?e.message:'风格包导入失败');}
});
await mountVdoNinjaRoutes(app,{getState:()=>state,getOutputState:()=>programState(state),authorize:req=>{seats.authorize(req.headers['x-seat-token'],'output');},file:path.join(dataDir,'vdo-ninja.json')});
registerIntegrationRoutes(app,integrations,()=>state,req=>seats.authorize(req.headers['x-seat-token'],'output'));
const twitchAudience=mountTwitchAudienceRoutes(app,{authorize:req=>{if(!isLoopback(req.socket.remoteAddress))throw new ValidationError('Twitch 凭据由导播主机管理');seats.authorize(req.headers['x-seat-token'],'output');}});
const cinematicEngine=await registerCinematicRoutes(app,{dataDir,request:localJson,authorize:req=>{seats.authorize(req.headers['x-seat-token'],'output');},playback:patch=>adapters.replay(patch,true)});
app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}));
app.use(express.static(path.join(root,'dist'),{index:false}));
app.get(/.*/,(_req,res)=>res.sendFile('index.html',{root:path.join(root,'dist')},error=>{if(error&&!res.headersSent)res.status(503).type('text').send('前端尚未构建。请执行 npm run build，或使用 npm run dev 开发模式。');}));
app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const bad=error instanceof ValidationError||error instanceof SyntaxError||error instanceof multer.MulterError;res.status(bad?400:503).json({error:error instanceof Error?error.message:'本地服务操作失败'});});
server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url??'/','http://127.0.0.1');
  if(shuttingDown||!validHost(req.headers.host,port,lan)||!validOrigin(req.headers.origin,port,lan)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  if(url.pathname==='/ws/obs-preview'){
    const kind=url.searchParams.get('kind');
    if(!isLoopback(req.socket.remoteAddress)||(kind!=='preview'&&kind!=='program')){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    monitorWss.handleUpgrade(req,socket,head,ws=>monitorStream.attach(ws,kind));return;
  }
  if(url.pathname!=='/ws'||(!isLoopback(req.socket.remoteAddress)&&!validToken(url.searchParams.get('token'),controlToken))){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
  wss.handleUpgrade(req,socket,head,ws=>{wss.emit('connection',ws,req);});
});
wss.on('connection',ws=>{ws.send(JSON.stringify(publicState(state)));ws.on('error',()=>{});});
const heartbeat=setInterval(()=>{tickAutomaticTransitions();integrations.observe();void integrations.flush();void nativeHud.tick();void adapters.productionTick().catch(()=>{});const p=ensureProduction(state);if(p.application?.status!=='requested'&&!automaticTransitionBusy&&p.analysisEndsAt&&Date.now()>=p.analysisEndsAt){delete p.analysisEndsAt;state.programScene='live';void adapters.productionApply().catch(()=>{});state.revision++;broadcast();}},1000);
const feedRotation=setInterval(()=>{if(tickPlayerFeeds(state)){state.revision++;broadcast();}},100);
const ocrPoll=setInterval(()=>{if(!currentGameResult(state))void economy.poll();},100);
const pollClients=clientPollScheduler(()=>{void adapters.poll();});
const poll=setInterval(()=>pollClients(Date.now(),state.settings.pollInterval),25);
server.listen(port,lan?'0.0.0.0':'127.0.0.1',()=>{console.log(`RiftCast 本地服务：http://127.0.0.1:${port}${lan?' · 局域网控制已启用':''}`);if(state.mode==='live')connectGameSources();if(process.env.RIFTCAST_OBS_AUTOSTART==='1')void adapters.obsEngineStatus().then(status=>status.mode==='embedded'?adapters.obsEngineStart():undefined).catch(()=>{/* Failure is displayed in the engine panel without blocking the director. */});});
server.on('error',error=>{console.error('本地服务启动失败：',error.message);process.exitCode=1;clearInterval(heartbeat);clearInterval(feedRotation);clearInterval(poll);clearInterval(ocrPoll);economy.close();void closeSpectatorOcrWorker();});
async function shutdown(){if(shuttingDown)return;shuttingDown=true;integrations.close();twitchAudience.disconnect();await cinematicEngine.close();clearInterval(heartbeat);clearInterval(feedRotation);clearInterval(poll);clearInterval(ocrPoll);economy.close();if(writeTimer)clearTimeout(writeTimer);monitorStream.close();monitorWss.close();let exitCode=0;await closeSpectatorOcrWorker();await nativeHud.close();try{await adapters.close();}catch{console.error('内置输出引擎未能正常关闭，请在引擎窗口确认输出已停止。');exitCode=1;}wss.close();server.close();try{await persist();}catch{console.error('退出保存失败，请保留数据目录并检查磁盘。');exitCode=1;}process.exit(exitCode);}
process.on('SIGINT',()=>{void shutdown();});process.on('SIGTERM',()=>{void shutdown();});
process.on('message',(message:unknown)=>{if(message==='riftcast-shutdown'||(message!==null&&typeof message==='object'&&!Array.isArray(message)&&(message as {type?:unknown}).type==='riftcast-shutdown'))void shutdown();});
