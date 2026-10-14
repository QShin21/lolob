// Independent Sol regression: real HTTP, WebSocket and UI. Synthetic LCU transport
// feeds the actual normalizeDraft/pollLcu code; source application is a labelled stub.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { chromium } from './playwright-system.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const source='7200a2d14dd07160c8aac9b9639901bc38bbb9cd';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source);
const evidence=path.join(path.dirname(fileURLToPath(import.meta.url)),'program-roster');await mkdir(evidence,{recursive:true});
const work=await mkdtemp(path.join(tmpdir(),'riftcast-sol-bp-boundaries-')),dataDir=path.join(work,'data');await mkdir(dataDir);
const {createSeed}=await tsImport(path.join(root,'server/state.ts'),import.meta.url);
const {captureProgram}=await tsImport(path.join(root,'shared/production.ts'),import.meta.url);
const {pendingContent}=await tsImport(path.join(root,'shared/presentation.ts'),import.meta.url);
const seed=createSeed();seed.mode='live';seed.paused=true;seed.phase='draft';seed.programScene=seed.previewScene='lineup';seed.production.rules.mode='standard';seed.overlay.nativeHud='off';seed.production.program=captureProgram(seed);
await writeFile(path.join(dataDir,'state.json'),JSON.stringify(seed));
const hook=path.join(work,'source-transport.mjs');
await writeFile(hook,`import {Adapters} from ${JSON.stringify(pathToFileURL(path.join(root,'server/adapters.ts')).href)};
const ids={Aatrox:266,Gwen:887,Akali:84,LeeSin:64,Ahri:103,Jinx:222,Thresh:412,Gnar:150,Viego:234,Orianna:61,Kaisa:145,Nautilus:111};
const roles=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
let lcuHero='Aatrox',live={hero:'Gwen',time:900,kills:2,cs:201,gold:12001,terminal:false},fail=false;
const heroes=first=>[first,'LeeSin','Ahri','Jinx','Thresh','Gnar','Viego','Orianna','Kaisa','Nautilus'];
Adapters.prototype.initializeObsEngine=async function(){
 this.credentials={port:59991,password:'synthetic-only',protocol:'https'};
 this.request=async(_port,endpoint)=>{
  if(endpoint==='/lol-gameflow/v1/session')return{phase:'ChampSelect',gameData:{gameId:777}};
  if(endpoint==='/lol-champ-select/v1/session'){
   const roster=heroes(lcuHero).map((hero,i)=>({cellId:i,teamId:i<5?100:200,summonerId:100+i,gameName:'待播客户端'+i,assignedPosition:roles[i%5],championId:ids[hero]}));
   return{myTeam:roster.slice(0,5),theirTeam:roster.slice(5),actions:[roster.map((player,i)=>({id:i,type:'pick',actorCellId:i,championId:player.championId,completed:true,isInProgress:false}))],timer:{adjustedTimeLeftInPhase:24000}};
  }
  if(endpoint==='/liveclientdata/allgamedata')return{
   gameData:{gameId:777,gameTime:live.time},allPlayers:heroes(live.hero).map((hero,i)=>({riotId:'SOL'+i+'#TEST',riotIdGameName:'合成选手'+i,summonerName:'SOL'+i+'#TEST',position:roles[i%5],team:i<5?'ORDER':'CHAOS',rawChampionName:'game_character_displayname_'+hero,championName:hero,level:14,totalGold:i===0?live.gold:11000-i*100,scores:{kills:i===0?live.kills:1,deaths:2,assists:3,creepScore:i===0?live.cs:180+i},items:[{itemID:1001,slot:0}],championStats:{currentHealth:450,maxHealth:1000}})),
   events:{Events:live.terminal?[{EventID:1,EventName:'GameEnd',EventTime:live.time,WinningTeam:100}]:[]}};
  throw Error('Physical client/OBS network is forbidden by this fixture');
 };
 this.commit(s=>{s.paused=true;s.connections.obs={status:'connected',detail:'SOL synthetic application only; no OBS instance'};});
 process.on('message',async m=>{if(m?.type!=='sol-boundary')return;try{
  if(m.lcu){lcuHero=m.lcu;await this.pollLcu();}
  if(m.live){live={...live,...m.live};await this.pollLive();}
  if(m.fail!==undefined)fail=m.fail;
  process.send?.({type:'sol-boundary-ack',id:m.id});
 }catch(e){process.send?.({type:'sol-boundary-ack',id:m.id,error:e.message});}});
};
Adapters.prototype.productionApply=async function(){await new Promise(r=>setTimeout(r,180));if(fail)throw Error('SOL synthetic source application failed');};
Adapters.prototype.syncPlayerFeeds=async()=>({applied:false});
for(const method of ['obsEngineStart','obsEngineOutput','obsEngineSetup','obsEnginePrepareCompanion','obsEngineInstallVirtualCamera','obsEngineMonitor','obsEngineLiveFrame','obsMusicImport','obsMusicControl'])Adapters.prototype[method]=async()=>{throw Error('SOL prohibits physical OBS/device operations');};
`);
const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));const base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['--import','tsx','--import',pathToFileURL(hook).href,'server/index.ts'],{cwd:root,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dataDir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1',RIFTCAST_OBS_MODE:'external'},stdio:['ignore','pipe','pipe','ipc']});
let log='',browser,main,program,owner;child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),outcomes=[],errors=[],actions=[];
const names={Aatrox:'暗裔剑魔',Gwen:'灵罗娃娃',Akali:'离群之刺',Ashe:'寒冰射手',Gnar:'迷失之牙'};
async function until(fn,label){for(let i=0;i<100;i++){if(await fn())return;await delay(80);}throw Error(label);}
async function read(){return fetch(base+'/api/state').then(r=>r.json());}
async function rpc(route,body){const r=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json','x-seat-token':owner},body:JSON.stringify(body)});const v=await r.json();return{status:r.status,data:v};}
async function action(body){const r=await rpc('/api/action',{...body,expectedConfigVersion:(await read()).production.configVersion,requestId:crypto.randomUUID()});assert.equal(r.status,200,r.data.error);return r.data;}
async function sourceSample(hero,timer=24000){return fixture({sample:{hero,timer}});}
async function fixture(extra){const id=crypto.randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.off('message',listener);reject(Error('fixture IPC timeout'));},4000),listener=m=>{if(m?.type==='sol-boundary-ack'&&m.id===id){clearTimeout(timer);child.off('message',listener);m.error?reject(Error(m.error)):resolve();}};child.on('message',listener);child.send({type:'sol-boundary',id,...extra});});}
const visible=async()=>program.locator('.cast-lineup-side.blue .cast-lineup-five article>small').first().innerText();
async function heroOnAir(hero){await until(async()=>await visible()===names[hero],`PGM did not show ${hero}`);}
async function picture(name,page=main){await page.evaluate(()=>{let badge=document.getElementById('sol-boundary-badge');if(!badge){badge=document.createElement('div');badge.id='sol-boundary-badge';badge.textContent='SOL 合成 LCU / 应用桩 · 非真实 OBS / 观众端';badge.style.cssText='position:fixed;top:1px;right:1px;z-index:2147483647;background:#ffe69c;color:#111;font:11px sans-serif;pointer-events:none;padding:2px 5px';}const host=document.querySelector('dialog[open]')||document.body;if(badge.parentElement!==host)host.append(badge);});await page.screenshot({path:path.join(evidence,name+'.png')});}
async function persist(){await writeFile(path.join(evidence,'results.json'),JSON.stringify({source,base,dataDir,synthetic:'Actual pollLcu/pollLive + HTTP/WS/renderers, synthetic request transport and application stub; no physical devices or network',outcomes,errors,actions},null,2));}
async function check(id,fn){try{const detail=await fn();outcomes.push({id,status:'pass',detail});console.log('PASS '+id);}catch(e){outcomes.push({id,status:'fail',error:e.message,stack:e.stack});console.log('FAIL '+id+': '+e.message);process.exitCode=1;}await picture(id);await picture(id+'-program',program);await persist();}
async function saveHero(hero){await main.locator('.bp-pick-row').first().click();await main.getByRole('searchbox',{name:'搜索英雄',exact:true}).fill(hero);await main.locator('.bp-candidate').first().click();await main.getByRole('button',{name:'保存此槽位到待播',exact:true}).click();await main.locator('dialog.bp-champion-dialog[open]').waitFor({state:'hidden'});}
async function take(){await main.locator('.broadcast-status .take-button').click();await until(async()=>['applied','failed'].includes((await read()).production.application?.status),'TAKE application did not settle');}
async function syncSection(){await main.getByRole('button',{name:'接管与差异',exact:true}).click();await main.getByRole('button',{name:'人工接管',exact:true}).waitFor();}
async function restoreAuto(){await main.getByRole('checkbox',{name:/已核对，将用上述客户端 BP/}).check();await main.getByRole('button',{name:'使用客户端样本，恢复同步',exact:true}).click();await until(async()=>(await read()).production.draftMode==='auto','automatic mode not staged');}
async function undo(){await main.getByRole('button',{name:'核对 / 应急',exact:true}).click();await main.getByRole('button',{name:'撤回上次切换',exact:true}).click();await main.keyboard.press('Escape');await until(async()=>(await read()).production.application?.status==='applied','undo not applied');}let remoteBase=`http://sol-workstation.test:${port}`;const origins=new Set([base,remoteBase]),extraServices=[];
const rosterIdentity=s=>s.players.map(({id,name,team,role,championId,championName,portrait})=>({id,name,team,role,championId,championName,portrait}));
let desktop,mobile,preview,mobileContext,aliasProxy;

async function loopbackUiProxy(){
 const {createServer:makeHttpServer}=await import('node:http');
 const {default:WebSocket,WebSocketServer}=await import('ws');
 const sockets=new Set(),proxy=makeHttpServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const headers={...req.headers,host:new URL(base).host};if(headers.origin)headers.origin=base;delete headers.connection;delete headers['content-length'];
   const response=await fetch(base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const resultHeaders=Object.fromEntries(response.headers);delete resultHeaders['content-encoding'];delete resultHeaders['content-length'];delete resultHeaders['transfer-encoding'];
   res.writeHead(response.status,resultHeaders);res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(502);res.end(String(e));}
 });
 const upgrades=new WebSocketServer({noServer:true});
 proxy.on('upgrade',(req,socket,head)=>upgrades.handleUpgrade(req,socket,head,front=>{
  const back=new WebSocket(base.replace('http:','ws:')+req.url,{headers:{Origin:base}});sockets.add(front);sockets.add(back);
  const pending=[];front.on('message',message=>back.readyState===WebSocket.OPEN?back.send(message):pending.push(message));
  back.on('open',()=>{for(const message of pending)back.send(message);});back.on('message',message=>{if(front.readyState===WebSocket.OPEN)front.send(message.toString());});
  front.on('close',()=>back.close());back.on('close',()=>front.close());back.on('error',()=>front.close());front.on('error',()=>back.close());
 }));
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 return{port:proxy.address().port,close:async()=>{for(const ws of sockets)ws.terminate();upgrades.close();await new Promise(r=>proxy.close(r));}};
}

async function networkContext(options={},token){
 const ctx=await browser.newContext({viewport:{width:1366,height:736},locale:'zh-CN',...options});
 if(token)await ctx.addInitScript(t=>{if(location.protocol==='http:')sessionStorage.setItem('riftcast-seat-token',t);},token);
 await ctx.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(!origins.has(u.origin))return route.abort();if(r.method()!=='GET'&&(u.pathname.startsWith('/api/obs/')||u.pathname==='/api/connect'))return route.fulfill({status:403,json:{error:'Sol prevents physical source/device actions'}});return route.continue();});
 ctx.on('page',p=>{p.setDefaultTimeout(6500);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/action'){const a=r.postDataJSON();actions.push({type:a.type,op:a.command?.op,requestIdPresent:!!a.requestId});}});});
 return ctx;
}
async function live(patch){await fixture({live:patch});}
async function prepare(scene,focus=false){
 await action({type:'production',command:{op:'draft-mode',mode:'manual'}});
 await action({type:'production',command:{op:'assign',assignments:[]}});
 await live({hero:'Gwen',time:900,kills:2,cs:201,gold:12001,terminal:false});
 await action({type:'set-draft',patch:{bluePicks:['Gwen','LeeSin','Ahri','Jinx','Thresh'],redPicks:['Gnar','Viego','Orianna','Kaisa','Nautilus']}});
 await action({type:'select-player',playerId:focus?(await read()).players[0].id:null});
 await action({type:'preview-scene',scene});await action({type:'take',scene});
 await program.locator('.cast-scene-'+scene).waitFor();
 await until(async()=>!await main.locator('.seat-recovery').count(),'owner verification');
}
async function signature(page,root='.broadcast-canvas'){
 return page.locator(root).evaluate(e=>({images:[...e.querySelectorAll('img')].map(i=>[i.getAttribute('alt'),i.getAttribute('src')]),names:[...e.querySelectorAll('.cast-lineup-five article>strong,.lb-player-name,.cast-performance-row strong,.cast-report-teams strong,.cast-interview-name>strong,.pb-focus-name strong,.pb-focus-name>span')].map(n=>n.textContent)}));
}
async function matchProgrammeHero(hero,page=program,scope='.broadcast-canvas'){
 await until(async()=>await page.locator(scope+` img[alt="${names[hero]}"]`).count()>0||await page.locator(scope+' .pb-focus-name>span').allTextContents().then(x=>x.includes(names[hero])),`programme hero ${hero} on ${page.url().split('?')[0]}`);
}
async function settleService(service){if(service.exitCode!==null)return;const exited=new Promise(r=>service.once('exit',r));service.send({type:'riftcast-shutdown'});await Promise.race([exited,delay(4000)]);if(service.exitCode===null){service.kill('SIGTERM');await Promise.race([exited,delay(1000)]);}}
async function legacyService(saved,label){
 const dir=path.join(work,label);await mkdir(dir);await writeFile(path.join(dir,'state.json'),JSON.stringify(saved));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const p=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${p}`;origins.add(origin);
 const service=spawn(process.execPath,['--import','tsx','--import',pathToFileURL(hook).href,'server/index.ts'],{cwd:root,env:{...process.env,PORT:String(p),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0',RIFTCAST_OFFLINE:'1',RIFTCAST_OBS_MODE:'external'},stdio:['ignore','pipe','pipe','ipc']});extraServices.push(service);
 let messages='';service.stdout.on('data',b=>messages+=b);service.stderr.on('data',b=>messages+=b);
 await until(async()=>{try{return(await fetch(origin+'/api/health')).ok;}catch{return false;}},'legacy isolated startup');
 const post=async(route,body,token)=>{const r=await fetch(origin+route,{method:'POST',headers:{'content-type':'application/json',...(token?{'x-seat-token':token}:{})},body:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,200,v.error);return v;};
 const seat=await post('/api/control/seat',{role:'director',name:'Sol legacy host'});
 const context=await networkContext({viewport:{width:1920,height:1080}},seat.token),page=await context.newPage();await page.goto(origin+'/overlay');await page.locator('.cast-scene-lineup').waitFor();
 const sample=async hero=>{const id=crypto.randomUUID();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('legacy sample timeout')),4000);const listener=m=>{if(m?.id===id){clearTimeout(timer);service.off('message',listener);m.error?reject(Error(m.error)):resolve();}};service.on('message',listener);service.send({type:'sol-boundary',id,live:{hero,time:1100,terminal:false}});});};
 const state=()=>fetch(origin+'/api/state').then(r=>r.json());
 return{dir,page,state,sample,action:async a=>post('/api/action',{...a,requestId:crypto.randomUUID(),expectedConfigVersion:(await state()).production.configVersion},seat.token),close:async()=>{await context.close();await settleService(service);await writeFile(path.join(evidence,label+'-service.txt'),messages);}};
}
try{
 await until(async()=>{try{return(await fetch(base+'/api/health')).ok;}catch{return false;}},'actual isolated startup');
 aliasProxy=await loopbackUiProxy();remoteBase=`http://sol-workstation.test:${aliasProxy.port}`;origins.add(remoteBase);
 browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP sol-workstation.test 127.0.0.1','--no-proxy-server']});
 const context=await networkContext();main=await context.newPage();await main.goto(base+'/#draft');await main.locator('.app-shell').waitFor();await until(async()=>!await main.locator('.seat-recovery').count(),'verified host');owner=await main.evaluate(()=>sessionStorage.getItem('riftcast-seat-token'));
 await live({hero:'Gwen',time:900});await action({type:'take',scene:'lineup'});
 program=await context.newPage();await program.setViewportSize({width:1920,height:1080});await program.goto(base+'/overlay');await matchProgrammeHero('Gwen');
 desktop=await context.newPage();await desktop.goto(base+'/#studio');await desktop.locator('.monitor-pane.program').getByRole('button',{name:'查看场景排版',exact:true}).click();await desktop.locator('.monitor-pane.preview').getByRole('button',{name:'查看场景排版',exact:true}).click();
 const remoteSeat=await rpc('/api/control/seat',{name:'Sol mobile read-only',role:'readonly',fresh:true});assert.equal(remoteSeat.status,200);
 mobileContext=await networkContext({viewport:{width:390,height:844}},remoteSeat.data.token);mobile=await mobileContext.newPage();await mobile.goto(remoteBase+'/remote');await mobile.getByRole('heading',{name:'只读席',exact:true}).waitFor();await mobile.getByRole('tab',{name:/PGM/}).click();assert.equal(await mobile.locator('.remote-layout-monitor.program').count(),1,'the mobile test exercises the actual remote rendering branch via an explicit loopback UI transport proxy');
 await writeFile(path.join(evidence,'startup.json'),JSON.stringify({source,base,dataDir,health:await fetch(base+'/api/health').then(r=>r.json()),remoteRendering:'sol-workstation.test uses an explicit loopback HTTP/WS transport proxy to the actual authorized service; no real LAN/mobile OS',synthetic:'Only source transport/application are stubbed; actual pollLive/pollLcu, HTTP, WebSocket and React execute'},null,2));
 for(const scene of ['draft','lineup','live','gold-ranking','economy','ranking','postgame','interview'])await check('pending-roster-boundary-'+scene,async()=>{
  await prepare(scene,scene==='interview');
  const before=await read(),identity=rosterIdentity(before),frame=await signature(program),n=actions.filter(a=>a.type==='take').length;
  await saveHero('Akali');await fixture({lcu:'Aatrox'});await syncSection();await restoreAuto();
  await delay(150);const after=await read();
  assert.equal(actions.filter(a=>a.type==='take').length,n,'no editorial source restore may TAKE');
  assert.equal(after.players[0].championId,'Aatrox');assert.notDeepEqual(rosterIdentity(after),identity);
  assert.deepEqual(rosterIdentity({players:after.production.programRosterHold}),identity);
  assert.deepEqual(await signature(program),frame,scene+' rendered staged player/hero membership');
  assert.ok(pendingContent(after).includes('BP'));assert.ok(pendingContent(after).includes('英雄归属'));
  return{scene,programme:'Gwen / original live-player identity',pending:'Aatrox / new LCU identity',takeRequests:0,pending:pendingContent(after)};
 });
 await check('same-ID-live-telemetry-advances-under-held-identity',async()=>{
  await prepare('live');await saveHero('Akali');const taken=await read();
  await live({hero:'Aatrox',time:1200,kills:19,cs:777,gold:20001});await matchProgrammeHero('Gwen');
  await until(async()=>await program.locator('.lb-player-row.blue .lb-cs').first().innerText()==='777','actual collected CS reaches programme');
  const s=await read();assert.equal(s.players[0].championId,'Aatrox');assert.equal(s.production.programRosterHold[0].championId,'Gwen');assert.equal(s.players[0].kills,19);assert.equal(s.gameTime,1200);
  assert.match(await program.locator('.lb-player-row.blue .lb-kda').first().innerText(),/19/);
  await matchProgrammeHero('Gwen',desktop,'.monitor-pane.program .broadcast-canvas');await matchProgrammeHero('Gwen',mobile,'.remote-layout-monitor.program .broadcast-canvas');
  assert.equal(await desktop.locator('.monitor-pane.program .lb-cs').first().innerText(),'777');assert.equal(await mobile.locator('.remote-layout-monitor.program .lb-cs').first().innerText(),'777');
  await picture('telemetry-desktop',desktop);await picture('telemetry-mobile',mobile);
  return{collectedBy:'actual pollLive/normalizeLive',oldCs:taken.players[0].cs,newCs:s.players[0].cs,pgmHero:'Gwen',pendingHero:'Aatrox',desktopMobileCs:777};
 });
 await check('GUI-assignment-swap-save-take-undo-redo',async()=>{
  await prepare('lineup');await main.getByRole('tab',{name:/^最终归属/}).click();
  await main.getByRole('combobox',{name:/与队友交换英雄/}).first().selectOption({index:1});
  const rows=main.locator('.bp-assignment-row');await rows.nth(0).getByRole('checkbox').check();await rows.nth(1).getByRole('checkbox').check();
  const n=actions.filter(a=>a.type==='take').length;await main.getByRole('button',{name:'保存已确认归属到待播',exact:true}).click();
  await until(async()=>(await read()).production.assignments.filter(a=>a.locked).length===2,'actual pending mapping saved');await matchProgrammeHero('Gwen');
  assert.equal(actions.filter(a=>a.type==='take').length,n);
  const mapping=(await read()).production.assignments.filter(a=>a.locked);assert.equal(mapping[0].championId,'LeeSin');assert.equal(mapping[1].championId,'Gwen');
  await take();await until(async()=>await program.locator('.cast-lineup-side.blue .cast-lineup-five article>small').first().innerText()==='盲僧','mapping published only after TAKE');
  await undo();await heroOnAir('Gwen');await undo();await until(async()=>await program.locator('.cast-lineup-side.blue .cast-lineup-five article>small').first().innerText()==='盲僧','redo restores accepted mapping');
  await picture('assignment-undo-redo-mobile',mobile);return{pendingOnlyTakeRequests:0,acceptedTop:'LeeSin',undoTop:'Gwen',redoTop:'LeeSin'};
 });
 await check('focus-programme-preserves-identity-after-new-archive-on-output-desktop-mobile',async()=>{
  await prepare('ranking',true);await matchProgrammeHero('Gwen');await saveHero('Akali');
  await live({hero:'Aatrox',time:1800,kills:21,cs:800,gold:21001,terminal:true});
  const s=await read(),record=s.gameResults.find(r=>r.id===s.finishedGameId);assert.ok(record);assert.equal(record.snapshot.players[0].championId,'Aatrox');assert.equal(s.production.programRosterHold[0].championId,'Gwen');
  await matchProgrammeHero('Gwen');await matchProgrammeHero('Gwen',desktop,'.monitor-pane.program .broadcast-canvas');await matchProgrammeHero('Gwen',mobile,'.remote-layout-monitor.program .broadcast-canvas');
  preview=await context.newPage();await preview.goto(base+'/overlay?preview=1');await matchProgrammeHero('Aatrox',preview);
  for(const [p,label]of [[program,'output'],[desktop,'desktop'],[mobile,'mobile']]){assert.equal(await p.locator('.pb-focus-name>span').first().innerText(),'灵罗娃娃');await picture('focus-archive-'+label,p);}
  await picture('focus-archive-preview',preview);return{archiveHero:'Aatrox',programmeHero:'Gwen',previewHero:'Aatrox',version:s.production.program.version};
 });
 await check('same-scene-focus-retake-publishes-selected-final-archive',async()=>{
  await take();await matchProgrammeHero('Aatrox');await matchProgrammeHero('Aatrox',desktop,'.monitor-pane.program .broadcast-canvas');await matchProgrammeHero('Aatrox',mobile,'.remote-layout-monitor.program .broadcast-canvas');
  const s=await read();assert.equal(s.production.programRosterHold,undefined);assert.equal(s.production.application.status,'applied');assert.notEqual(s.production.application.status,'confirmed');return{outputDesktopMobile:'Aatrox after explicit same-scene TAKE',application:s.production.application.status};
 });
 await check('legacy-BP-only-hold-uses-last-accepted-roster-not-fabricated-handoff',async()=>{
  const old=createSeed();old.mode='live';old.programScene=old.previewScene='lineup';old.phase='draft';old.production.rules.mode='standard';old.production.program=captureProgram(old);
  old.production.programDraftHold={...structuredClone(old.draft),bluePicks:['Gwen',...old.draft.bluePicks.slice(1)]};old.draft.bluePicks[0]='Ashe';old.players[0].championId='Ashe';delete old.production.programRosterHold;
  const service=await legacyService(old,'legacy-bp-only');try{await service.sample('Ashe');await matchProgrammeHero('Aatrox',service.page);const s=await service.state();assert.equal(s.production.programRosterHold,undefined);assert.equal(s.production.programDraftHold.bluePicks[0],'Gwen');assert.equal(s.players[0].championId,'Ashe');await picture('legacy-last-accepted-roster',service.page);const detail={acceptedHero:'Aatrox',storedDraftOnly:'Gwen',currentSample:'Ashe',renderedLineup:'Aatrox',limitation:'No historical handoff player identities exist; Gwen roster is not claimed to be reconstructed'};await writeFile(path.join(evidence,'legacy-observation.json'),JSON.stringify(detail,null,2));return detail;}finally{await service.close();}
 });
 await check('legacy-undo-without-rosterHold-restores-accepted-players-and-rejects-later-samples',async()=>{
  const old=createSeed();old.mode='live';old.phase='draft';old.programScene=old.previewScene='lineup';old.production.rules.mode='standard';old.production.program=captureProgram(old);
  const prior=structuredClone(old.production.program);prior.telemetry.players[0].championId='Ashe';prior.telemetry.players[0].championName='寒冰射手';prior.draft.bluePicks[0]='Ashe';old.production.previousProgram={content:prior,scene:'lineup',draftHold:structuredClone(prior.draft)};
  const service=await legacyService(old,'legacy-undo');try{await service.action({type:'production',command:{op:'immediate',action:'undo'}});await matchProgrammeHero('Ashe',service.page);await service.sample('Akali');await matchProgrammeHero('Ashe',service.page);const s=await service.state();assert.equal(s.players[0].championId,'Akali');assert.equal(s.production.programRosterHold[0].championId,'Ashe');await picture('legacy-undo-programme',service.page);return{acceptedPreviousHero:'Ashe',currentSample:'Akali',programme:'Ashe'};}finally{await service.close();}
 });
 assert.deepEqual(errors,[]);
}catch(e){outcomes.push({id:'harness',status:'error',error:e.message,stack:e.stack});console.log(e.stack);await picture('harness-fatal',mobile||main).catch(()=>{});process.exitCode=1;}
finally{await persist();await browser?.close();await aliasProxy?.close();for(const service of extraServices)await settleService(service);await settleService(child);await writeFile(path.join(evidence,'service.txt'),log);console.log(JSON.stringify({source,pass:outcomes.filter(x=>x.status==='pass').length,fail:outcomes.filter(x=>x.status!=='pass').length,errors:errors.length}));}
