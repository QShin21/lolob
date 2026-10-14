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
const source='61ab1645378f1987fa62f478f75b87dddb83f2cc';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source);
const evidence=path.join(path.dirname(fileURLToPath(import.meta.url)),'program-lineup');await mkdir(evidence,{recursive:true});
const work=await mkdtemp(path.join(tmpdir(),'riftcast-sol-bp-boundaries-')),dataDir=path.join(work,'data');await mkdir(dataDir);
const {createSeed}=await tsImport(path.join(root,'server/state.ts'),import.meta.url);
const {captureProgram}=await tsImport(path.join(root,'shared/production.ts'),import.meta.url);
const {pendingContent}=await tsImport(path.join(root,'shared/presentation.ts'),import.meta.url);
const seed=createSeed();seed.mode='live';seed.paused=true;seed.phase='draft';seed.programScene=seed.previewScene='lineup';seed.production.rules.mode='standard';seed.overlay.nativeHud='off';seed.production.program=captureProgram(seed);
await writeFile(path.join(dataDir,'state.json'),JSON.stringify(seed));
const hook=path.join(work,'source-transport.mjs');
await writeFile(hook,`import {Adapters} from ${JSON.stringify(pathToFileURL(path.join(root,'server/adapters.ts')).href)};
const ids={Aatrox:266,Gwen:887,Akali:84,Ashe:22,Gnar:150};let sample={hero:'Aatrox',timer:24000},fail=false;
Adapters.prototype.initializeObsEngine=async function(){
 this.credentials={port:59991,password:'synthetic-only',protocol:'https'};
 this.request=async(_port,endpoint)=>{
  if(endpoint==='/lol-gameflow/v1/session')return{phase:'ChampSelect',gameData:{gameId:777}};
  if(endpoint==='/lol-champ-select/v1/session')return{
   myTeam:Array.from({length:5},(_,i)=>({cellId:i,teamId:100,summonerId:100+i,championId:i===0?ids[sample.hero]:0})),
   theirTeam:Array.from({length:5},(_,i)=>({cellId:5+i,teamId:200,summonerId:200+i,championId:0})),
   actions:[[{id:1,type:'pick',actorCellId:0,championId:ids[sample.hero],completed:true,isInProgress:false}]],
   timer:{adjustedTimeLeftInPhase:sample.timer}};
  throw Error('No physical client request is allowed');
 };
 this.commit(s=>{s.paused=true;s.connections.obs={status:'connected',detail:'SOL synthetic application only; no OBS instance'};});
 process.on('message',async m=>{if(m?.type!=='sol-boundary')return;try{
  if(m.sample){sample=m.sample;await this.pollLcu();}
  if(m.fail!==undefined)fail=m.fail;
  process.send?.({type:'sol-boundary-ack',id:m.id});
 }catch(e){process.send?.({type:'sol-boundary-ack',id:m.id,error:e.message});}});
};
Adapters.prototype.productionApply=async function(){await new Promise(r=>setTimeout(r,180));if(fail)throw Error('SOL synthetic source preparation failed');};
Adapters.prototype.syncPlayerFeeds=async()=>({applied:false});
for(const method of ['obsEngineStart','obsEngineOutput','obsEngineSetup','obsEnginePrepareCompanion','obsEngineInstallVirtualCamera','obsEngineMonitor','obsEngineLiveFrame','obsMusicImport','obsMusicControl'])Adapters.prototype[method]=async()=>{throw Error('SOL forbids physical OBS/device operations');};
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
async function persist(){await writeFile(path.join(evidence,'results.json'),JSON.stringify({source,base,dataDir,synthetic:'LCU transport and 180ms source application only; actual production logic, HTTP, WS and renderer',outcomes,errors,actions},null,2));}
async function check(id,fn){try{const detail=await fn();outcomes.push({id,status:'pass',detail});console.log('PASS '+id);}catch(e){outcomes.push({id,status:'fail',error:e.message,stack:e.stack});console.log('FAIL '+id+': '+e.message);process.exitCode=1;}await picture(id);await picture(id+'-program',program);await persist();}
async function saveHero(hero){await main.locator('.bp-pick-row').first().click();await main.getByRole('searchbox',{name:'搜索英雄',exact:true}).fill(hero);await main.locator('.bp-candidate').first().click();await main.getByRole('button',{name:'保存此槽位到待播',exact:true}).click();await main.locator('dialog.bp-champion-dialog[open]').waitFor({state:'hidden'});}
async function take(){await main.locator('.broadcast-status .take-button').click();await until(async()=>['applied','failed'].includes((await read()).production.application?.status),'TAKE application did not settle');}
async function syncSection(){await main.getByRole('button',{name:'接管与差异',exact:true}).click();await main.getByRole('button',{name:'人工接管',exact:true}).waitFor();}
async function restoreAuto(){await main.getByRole('checkbox',{name:/已核对，将用上述客户端 BP/}).check();await main.getByRole('button',{name:'使用客户端样本，恢复同步',exact:true}).click();await until(async()=>(await read()).production.draftMode==='auto','automatic mode not staged');}
async function undo(){await main.getByRole('button',{name:'核对 / 应急',exact:true}).click();await main.getByRole('button',{name:'撤回上次切换',exact:true}).click();await main.keyboard.press('Escape');await until(async()=>(await read()).production.application?.status==='applied','undo not applied');}
try{
 await until(async()=>{try{return(await fetch(base+'/api/health').then(r=>r.json())).status==='ok';}catch{return false;}},'actual isolated service startup');
 await writeFile(path.join(evidence,'startup.json'),JSON.stringify({source,base,dataDir,health:await fetch(base+'/api/health').then(r=>r.json()),synthetic:'source transport only; no real OBS or client'},null,2));
 browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1366,height:736},locale:'zh-CN'});
 await ctx.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==base)return route.abort();if(r.method()!=='GET'&&(u.pathname.startsWith('/api/obs/')||u.pathname==='/api/connect'))return route.fulfill({status:403,json:{error:'SOL blocks physical actions'}});return route.continue();});
 ctx.on('page',p=>{p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/action'){const a=r.postDataJSON();actions.push({type:a.type,op:a.command?.op});}});});
 main=await ctx.newPage();await main.goto(base+'/#draft');await main.locator('.app-shell').waitFor();await until(async()=>!await main.locator('.seat-recovery').count(),'seat verification');owner=await main.evaluate(()=>sessionStorage.getItem('riftcast-seat-token'));
 await sourceSample('Aatrox');await action({type:'take',scene:'lineup'});
 program=await ctx.newPage();await program.setViewportSize({width:1920,height:1080});await program.goto(base+'/overlay');await heroOnAir('Aatrox');
 let before;
 await check('lineup-legitimate-automatic-roster-progress',async()=>{await sourceSample('Gwen');await heroOnAir('Gwen');before=await read();assert.equal(before.production.program.telemetry.players[0].championId,'Aatrox');assert.equal(before.players[0].championId,'Gwen');});
 await check('lineup-manual-save-still-preserves-current-picture',async()=>{await saveHero('Akali');await heroOnAir('Gwen');await sourceSample('Aatrox');await heroOnAir('Gwen');assert.equal((await read()).production.programDraftHold.bluePicks[0],'Gwen');});
 await check('lineup-restore-auto-cannot-publish-pending-roster-before-take',async()=>{const takes=actions.filter(x=>x.type==='take').length,oldVisible=await visible();await syncSection();await restoreAuto();await delay(250);const s=await read(),newVisible=await visible();const observation={scene:s.programScene,before:oldVisible,after:newVisible,takesDuringRestore:actions.filter(x=>x.type==='take').length-takes,programmeSnapshotHero:s.production.program.telemetry.players[0].championId,heldDraft:s.production.programDraftHold.bluePicks[0],pendingDraft:s.draft.bluePicks[0],currentRosterHero:s.players[0].championId,snapshotUnchanged:JSON.stringify(s.production.program)===JSON.stringify(before.production.program)};await writeFile(path.join(evidence,'lineup-isolation-observation.json'),JSON.stringify(observation,null,2));assert.equal(observation.takesDuringRestore,0);assert.equal(observation.snapshotUnchanged,true);assert.equal(newVisible,oldVisible,'Pending-only automatic restore changed the rendered lineup programme hero');return observation;});
 assert.deepEqual(errors,[]);
}catch(e){outcomes.push({id:'harness',status:'error',error:e.message,stack:e.stack});console.log(e.stack);process.exitCode=1;}
finally{await persist();await browser?.close();if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.send({type:'riftcast-shutdown'});await Promise.race([exited,delay(4000)]);if(child.exitCode===null)child.kill('SIGTERM');}await writeFile(path.join(evidence,'service.txt'),log);console.log(JSON.stringify({source,pass:outcomes.filter(x=>x.status==='pass').length,fail:outcomes.filter(x=>x.status!=='pass').length,errors:errors.length}));}
