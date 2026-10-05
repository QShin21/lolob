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
import { applyAction, createSeed, csvRecording, normalizeSavedState, publicState, record, resetRuntimeState, snapshotRecording, tickDemo, ValidationError } from './state';
import { inspectImage, isLoopback, lanAddresses, validHost, validOrigin, validToken } from './security';
import { EconomyBridge } from './economy';
import { closeSpectatorOcrWorker } from './spectator-ocr-worker';
import { tickPlayerFeeds } from '../shared/player-feeds';
import { NativeHudController } from './native-hud';
import { ObsPreviewStream } from './obs-preview-stream';
import { currentGameResult, frozenGameState } from '../shared/game-results';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.RIFTCAST_DATA_DIR?path.resolve(process.env.RIFTCAST_DATA_DIR):path.join(root,'data');
const uploadDir=path.join(dataDir,'uploads');const stateFile=path.join(dataDir,'state.json');
const port=Number(process.env.PORT??3888);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT 需为有效端口');
const lan=process.env.ENABLE_LAN==='1';const controlToken=randomBytes(18).toString('base64url');
await mkdir(uploadDir,{recursive:true});
let state=createSeed();
try{const saved=JSON.parse(await readFile(stateFile,'utf8'))as BroadcastState;if(saved&&saved.match&&saved.overlay&&saved.settings&&Array.isArray(saved.players)&&Array.isArray(saved.teams)&&['demo','live'].includes(saved.mode))state=normalizeSavedState(saved);}catch{/* first run uses explicit demo mode */}
resetRuntimeState(state);
const app=express();const server=http.createServer(app);const wss=new WebSocketServer({noServer:true,maxPayload:4096});let writeTimer:ReturnType<typeof setTimeout>|undefined;let dirty=false;let pendingWrite:Promise<void>|undefined;let shuttingDown=false;
function persist():Promise<void>{dirty=true;if(pendingWrite)return pendingWrite;pendingWrite=(async()=>{try{while(dirty){dirty=false;try{await writeFile(`${stateFile}.tmp`,JSON.stringify(publicState(state),null,2),'utf8');await rename(`${stateFile}.tmp`,stateFile);}catch(e){console.error('状态保存失败：',e instanceof Error?e.message:'无法写入文件');}}}finally{pendingWrite=undefined;}})();return pendingWrite;}
function broadcast(){if(shuttingDown)return;void adapters.syncPlayerFeeds().catch(()=>{});const value=JSON.stringify(publicState(state));for(const socket of wss.clients)if(socket.readyState===WebSocket.OPEN){if(socket.bufferedAmount>1024*1024)socket.close(1013,'客户端接收速度过慢');else socket.send(value);}if(writeTimer)clearTimeout(writeTimer);writeTimer=setTimeout(()=>{void persist();},250);}
function commit(work:(s:BroadcastState)=>void){if(shuttingDown)return;const beforeResult=currentGameResult(state),beforeWinner=beforeResult?.winner,beforeTerminal=beforeResult?.terminalSampleAccepted;work(state);if(currentGameResult(state)){const frozen=frozenGameState(state);Object.assign(state,{players:frozen.players,stats:frozen.stats,events:frozen.events,economy:frozen.economy,draft:frozen.draft,gameTime:frozen.gameTime,economyFeed:frozen.economyFeed,phase:'postgame',paused:true});delete state.gameClock;}state.revision++;broadcast();const afterResult=currentGameResult(state);if(afterResult&&(afterResult.id!==beforeResult?.id||afterResult.winner!==beforeWinner||afterResult.terminalSampleAccepted!==beforeTerminal))void persist();}
const economy:EconomyBridge=new EconomyBridge(()=>state,commit,{frame:():Promise<Buffer>=>adapters.spectatorFrame()});state.economyFeed=economy.status();
const catalog=new ChampionCatalog(dataDir);const adapters:Adapters=new Adapters(()=>state,commit,catalog,undefined,economy);void catalog.load();
await adapters.initializeObsEngine({root,dataDir,overlayUrl:`http://127.0.0.1:${port}/overlay`});
const monitorWss=new WebSocketServer({noServer:true,maxPayload:64,perMessageDeflate:false});
const monitorStream=new ObsPreviewStream(kind=>adapters.obsEngineLiveFrame(kind));
const nativeHud=new NativeHudController(()=>state,commit,localJson);
function connectGameSources(){if(process.env.RIFTCAST_AUTO_CONNECT==='0')return;void Promise.allSettled((['lcu','live','replay']as const).map(target=>adapters.connect(target)));}
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  if(shuttingDown){res.status(503).json({error:'本地服务正在保存数据并关闭'});return;}
  if(!validHost(req.headers.host,port,lan)){res.status(403).json({error:'请求主机不在允许列表中'});return;}
  if(!validOrigin(req.headers.origin,port,lan)){res.status(403).json({error:'请求来源不在允许列表中'});return;}
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!isLoopback(req.socket.remoteAddress)&&!validToken(req.headers['x-control-token']??req.query.token,controlToken)){res.status(401).json({error:'需要手机控制配对令牌'});return;}
  next();
});
app.use(express.json({limit:'512kb'}));
app.get('/api/health',(_req,res)=>res.json({service:'riftcast-director',version:'0.2.0',status:'ok',mode:state.mode,lanEnabled:lan}));
app.get('/api/obs/cameras',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'摄像头源仅支持在导播主机读取'});return;}res.json(await adapters.obsCameraDevices());});
app.post('/api/obs/player-feeds',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'选手摄像头仅支持在导播主机应用'});return;}res.json(await adapters.syncPlayerFeeds(true));});
app.get('/api/state',(_req,res)=>res.json(publicState(state)));
app.post('/api/action',(req,res)=>{const action=record(req.body);if(!isLoopback(req.socket.remoteAddress)&&action.type==='set-settings')throw new ValidationError('连接设置仅支持在导播主机修改');const previousMode=state.mode,previousProgramScene=state.programScene;const next=applyAction(state,action);if(action.type==='set-settings'){const patch=record(action.patch);if(patch.obsPassword!==undefined)adapters.setPassword(String(patch.obsPassword));}state=next;broadcast();if(["finalize-game","next-game"].includes(String(action.type)))void persist();res.json(publicState(state));if(previousProgramScene!==state.programScene)void nativeHud.tick(true);if(previousMode!=='live'&&state.mode==='live')connectGameSources();});
app.get('/api/champions',async(_req,res)=>{await catalog.load();res.json({version:catalog.version,champions:catalog.champions});});
app.post('/api/connect',async(req,res)=>{const target=record(req.body).target;if(!['lcu','live','replay','obs'].includes(String(target)))throw new ValidationError('连接目标无效');if(target==='obs'&&!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'输出引擎仅支持在导播主机连接'});return;}await adapters.connect(target as 'lcu');res.json(publicState(state));});
app.post('/api/replay',async(req,res)=>res.json(await adapters.replay(req.body)));
app.get('/api/replay/diagnostics',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await adapters.replayDiagnostics());});
app.post('/api/replay/hud',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'原生 HUD 控制仅支持在导播主机应用'});return;}await nativeHud.tick(true);res.json(state.nativeHudStatus);});
app.get('/api/economy/status',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(economy.status());});
app.use('/api/economy', (req,res,next)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'观战经济采集仅支持在导播主机配置'});return;}next();});
app.post('/api/economy/config',(req,res)=>res.json(economy.configure(req.body)));
app.post('/api/economy/sample',(req,res)=>res.json(economy.sample(req.body)));
app.post('/api/economy/probe',async(req,res)=>{const body=record(req.body??{});const delay=body.delayMs??0;if(typeof delay!=='number'||!Number.isInteger(delay)||delay<0||delay>5000)throw new ValidationError('识别延时需在 0–5000 毫秒范围');if(delay)await new Promise(resolve=>setTimeout(resolve,delay));res.json(await economy.probe());});
app.post('/api/economy/calibrate',async(req,res)=>{const body=record(req.body??{});const delay=body.delayMs??3000;if(typeof delay!=='number'||!Number.isInteger(delay)||delay<0||delay>5000)throw new ValidationError('定位延时需在 0–5000 毫秒范围');if(delay)await new Promise(resolve=>setTimeout(resolve,delay));res.json(await economy.autoCalibrate());});
app.get('/api/obs/scenes',async(_req,res)=>res.json(await adapters.obsScenes()));
app.post('/api/obs/scene',async(req,res)=>res.json(await adapters.obsScene(req.body)));
app.get('/api/obs/stream/status',async(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await adapters.obsStreamStatus());});
app.post('/api/obs/stream/settings',async(req,res)=>{res.setHeader('Cache-Control','no-store');if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'推流配置仅支持在导播主机修改'});return;}res.json(await adapters.obsStreamSettings(req.body));});
app.post('/api/obs/hud',async(req,res)=>{if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'OBS 来源仅支持在导播主机添加'});return;}res.json(await adapters.obsHud(req.body,`http://127.0.0.1:${port}/overlay`));});
app.use('/api/obs/engine',(req,res,next)=>{res.setHeader('Cache-Control','no-store');if(!isLoopback(req.socket.remoteAddress)){res.status(403).json({error:'内置输出引擎仅支持在导播主机管理'});return;}next();});
app.get('/api/obs/engine',async(_req,res)=>res.json(await adapters.obsEngineStatus()));
app.post('/api/obs/engine/start',async(_req,res)=>res.json(await adapters.obsEngineStart()));
app.post('/api/obs/engine/mode',async(req,res)=>res.json(await adapters.obsEngineMode(req.body)));
app.post('/api/obs/engine/setup',async(req,res)=>res.json(await adapters.obsEngineSetup(req.body)));
app.get('/api/obs/engine/preview',async(_req,res)=>res.json(await adapters.obsEnginePreview()));
app.post('/api/obs/engine/monitor',async(req,res)=>res.json(await adapters.obsEngineMonitor(req.body)));
app.post('/api/obs/engine/output',async(req,res)=>res.json(await adapters.obsEngineOutput(req.body)));
app.get('/api/network',(req,res)=>{res.setHeader('Cache-Control','no-store');res.json({enabled:lan,urls:lan?lanAddresses().map(address=>`http://${address}:${port}/remote`):[],...(isLoopback(req.socket.remoteAddress)?{controlToken}:{}),message:lan?'手机与主机需连接同一局域网':'以 ENABLE_LAN=1 启动服务后可开启手机控制'});});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:4},fileFilter:(_req,file,cb)=>{if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.mimetype)){cb(new ValidationError('仅支持 PNG、JPEG、WebP、GIF 图片'));return;}cb(null,true);}});
app.post('/api/assets',upload.single('file'),async(req,res)=>{if(!req.file)throw new ValidationError('请选择图片文件');const info=inspectImage(req.file.buffer);if(req.file.mimetype!==info.mime)throw new ValidationError('图片签名与文件类型不符');const id=randomUUID();const file=`${id}.${info.extension}`;await writeFile(path.join(uploadDir,file),req.file.buffer);const asset={id,name:path.basename(req.file.originalname.replaceAll('\\','/')).slice(0,100),url:`/uploads/${file}`,type:info.mime,createdAt:new Date().toISOString()};commit(s=>{s.assets.unshift(asset);s.assets=s.assets.slice(0,1000);});res.status(201).json(asset);});
app.use('/uploads',express.static(uploadDir,{index:false,dotfiles:'deny',maxAge:'1d',setHeaders:res=>res.setHeader('Content-Security-Policy',"default-src 'none'")}));
app.get('/api/export',(req,res)=>{const format=req.query.format??'json';if(!['json','csv'].includes(String(format)))throw new ValidationError('导出格式需为 json 或 csv');let recording:Recording|undefined;if(req.query.recordingId){recording=state.recordings.find(r=>r.id===req.query.recordingId);if(!recording)throw new ValidationError('记录不存在');}else recording=snapshotRecording(state,{id:'current',title:state.match.title});res.setHeader('Content-Disposition',`attachment; filename="riftcast-${recording.id.replace(/[^a-z0-9-]/gi,'')}.${format}"`);if(format==='csv'){res.type('text/csv; charset=utf-8').send(csvRecording(recording));return;}res.json(recording);});
app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在'}));
app.use(express.static(path.join(root,'dist'),{index:false}));
app.get(/.*/,(_req,res)=>res.sendFile(path.join(root,'dist','index.html'),error=>{if(error&&!res.headersSent)res.status(503).type('text').send('前端尚未构建。请执行 npm run build，或使用 npm run dev 开发模式。');}));
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
const heartbeat=setInterval(()=>{void nativeHud.tick();if(state.mode==='demo'&&!state.paused&&['live','draft'].includes(state.phase)){tickDemo(state);state.revision++;broadcast();}},1000);
const feedRotation=setInterval(()=>{if(tickPlayerFeeds(state)){state.revision++;broadcast();}},100);
const ocrPoll=setInterval(()=>{if(!currentGameResult(state))void economy.poll();},100);
let nextPoll=0;const poll=setInterval(()=>{if(Date.now()<nextPoll)return;nextPoll=Date.now()+state.settings.pollInterval;void adapters.poll();},500);
server.listen(port,lan?'0.0.0.0':'127.0.0.1',()=>{console.log(`RiftCast 本地服务：http://127.0.0.1:${port}${lan?' · 局域网控制已启用':''}`);if(state.mode==='live')connectGameSources();if(process.env.RIFTCAST_OBS_AUTOSTART==='1')void adapters.obsEngineStatus().then(status=>status.mode==='embedded'?adapters.obsEngineStart():undefined).catch(()=>{/* Failure is displayed in the engine panel without blocking the director. */});});
server.on('error',error=>{console.error('本地服务启动失败：',error.message);process.exitCode=1;clearInterval(heartbeat);clearInterval(feedRotation);clearInterval(poll);clearInterval(ocrPoll);economy.close();void closeSpectatorOcrWorker();});
async function shutdown(){if(shuttingDown)return;shuttingDown=true;clearInterval(heartbeat);clearInterval(feedRotation);clearInterval(poll);clearInterval(ocrPoll);economy.close();if(writeTimer)clearTimeout(writeTimer);monitorStream.close();monitorWss.close();let exitCode=0;await closeSpectatorOcrWorker();await nativeHud.close();try{await adapters.close();}catch{console.error('内置输出引擎未能正常关闭，请在引擎窗口确认输出已停止。');exitCode=1;}wss.close();server.close();await persist();process.exit(exitCode);}
process.on('SIGINT',()=>{void shutdown();});process.on('SIGTERM',()=>{void shutdown();});
process.on('message',(message:unknown)=>{if(message==='riftcast-shutdown'||(message!==null&&typeof message==='object'&&!Array.isArray(message)&&(message as {type?:unknown}).type==='riftcast-shutdown'))void shutdown();});
