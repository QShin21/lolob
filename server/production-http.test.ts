import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, type AddressInfo } from 'node:net';

async function service(failSave=false,delayed?:'success'|'failure'){
  const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=(socket.address() as AddressInfo).port;await new Promise<void>(resolve=>socket.close(()=>resolve()));
  const dir=await mkdtemp(path.join(tmpdir(),'riftcast-production-http-')),base=`http://127.0.0.1:${port}`;
  const preload=path.join(dir,'failure.cjs');
  if(failSave)await writeFile(preload,"const fs=require('node:fs/promises'),old=fs.rename;fs.rename=async function(a,b){if(String(b).endsWith('state.json'))throw new Error('fixture ENOSPC');return old(a,b);};require('node:module').syncBuiltinESMExports();");
  const obsHook=path.join(dir,'obs-hook.mjs');
  if(delayed)await writeFile(obsHook,`import {Adapters} from '${pathToFileURL(path.join(process.cwd(),'server/adapters.ts')).href}';Adapters.prototype.initializeObsEngine=async function(){this.commit(s=>{s.paused=true;s.connections.obs.status='connected';});};Adapters.prototype.syncPlayerFeeds=async()=>({applied:true});Adapters.prototype.productionApply=async function(_switch,candidate){process.send?.({type:'fixture-apply-started'});await new Promise(r=>setTimeout(r,400));this.commit(s=>{s.gameTime+=7;});${delayed==='failure'?'throw new Error("fixture source failure");':''}};`);
  const child=spawn(process.execPath,[...(failSave?['--require',preload]:[]),'--import','tsx',...(delayed?['--import',pathToFileURL(obsHook).href]:[]),'server/index.ts'],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),ENABLE_LAN:'0',RIFTCAST_DATA_DIR:dir,RIFTCAST_AUTO_CONNECT:'0',RIFTCAST_OBS_AUTOSTART:'0'},stdio:['ignore','ignore','ignore','ipc']});
  const close=async()=>{if(child.exitCode===null){child.send({type:'riftcast-shutdown'});await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},4000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('riftcast-production-http-'));await rm(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:100});};
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)break;try{if((await fetch(`${base}/api/health`)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready){await close();throw new Error('isolated service did not become available');}
  const get=()=>fetch(base+'/api/state').then(r=>r.json());
  const post=(route:string,body:unknown,token?:string)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'x-seat-token':token}:{})},body:JSON.stringify(body)});
  return {dir,base,close,get,post,child};
}

test('HTTP seats enforce stale forms, idempotent submissions and explicit ownership transfer',{timeout:20000},async()=>{
  const api=await service();try{
    const owner=await api.post('/api/control/seat',{name:'主导播'}).then(r=>r.json());
    const data=await api.post('/api/control/seat',{name:'资料席',role:'data'}).then(r=>r.json());
    const readonly=await api.post('/api/control/seat',{role:'readonly'}).then(r=>r.json());
    let state=await api.get(),version=state.production.configVersion;
    const action={type:'set-overlay',patch:{tickerText:'已准备字幕'},expectedConfigVersion:version,requestId:'first'};
    assert.equal((await api.post('/api/action',action,data.token)).status,200);
    assert.equal((await api.post('/api/action',action,data.token)).status,200,'same request is acknowledged before stale-version checks');
    assert.equal((await api.get()).production.configVersion,version+1,'a retry applies once');
    assert.equal((await api.post('/api/action',{...action,patch:{tickerText:'different'}},data.token)).status,400);
    assert.equal((await api.post('/api/action',{...action,requestId:'stale'},data.token)).status,409);
    state=await api.get();version=state.production.configVersion;
    const concurrent=await Promise.all([api.post('/api/action',{type:'set-match',patch:{title:'A'},expectedConfigVersion:version,requestId:'a'},data.token),api.post('/api/action',{type:'set-match',patch:{title:'B'},expectedConfigVersion:version,requestId:'b'},data.token)]);
    assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    const next=async(type:string,extra:object,token:string)=>api.post('/api/action',{type,...extra,expectedConfigVersion:(await api.get()).production.configVersion,requestId:crypto.randomUUID()},token);
    assert.equal((await next('take',{},data.token)).status,400);assert.equal((await next('set-overlay',{patch:{ticker:true}},readonly.token)).status,400);
    assert.equal((await api.post('/api/obs/production',{action:'save-clip'},data.token)).status,400);
    const second=await api.post('/api/control/seat',{name:'备份导播'}).then(r=>r.json());assert.equal((await next('take',{},second.token)).status,400);
    assert.equal((await api.post('/api/control/claim',{reason:'主导播交接'},second.token)).status,200);
    assert.equal((await next('take',{},owner.token)).status,400);assert.equal((await next('take',{},second.token)).status,200);
    const saved=JSON.parse(await readFile(path.join(api.dir,'state.json'),'utf8'));assert.ok(saved.production.audit.some((a:any)=>a.type==='claim-control'&&a.actor==='备份导播'&&a.reason==='主导播交接'));
    const inventory=await fetch(api.base+'/api/resources/inventory').then(r=>r.json());assert.equal(inventory.champions,173);assert.deepEqual(inventory.missing,[]);
    const archive=await fetch(api.base+'/api/archive').then(r=>r.json());assert.equal(archive.version,'0.3.0');assert.equal(JSON.stringify(archive).includes(second.token),false);
  }finally{await api.close();}
});

for(const delayed of ['success','failure'] as const)test(`delayed ${delayed} source application publishes PGM only after preparation and preserves telemetry`,{timeout:20000},async()=>{
  const api=await service(false,delayed);try{
    const original=await api.get();
    const owner=await api.post('/api/control/seat',{name:'原主导播'}).then(r=>r.json());
    const replacement=await api.post('/api/control/seat',{name:'接班导播'}).then(r=>r.json());
    await api.post('/api/action',{type:'set-match',patch:{title:'Prepared title'},expectedConfigVersion:original.production.configVersion,requestId:'prepare'},owner.token);
    const started=new Promise<void>(resolve=>api.child.once('message',()=>resolve()));
    const take=api.post('/api/action',{type:'take',scene:'live',expectedConfigVersion:(await api.get()).production.configVersion,requestId:'take'},owner.token);await started;
    const claim=api.post('/api/control/claim',{reason:'切入完成后交接'},replacement.token);
    const pending=await api.get();assert.equal(pending.production.application.status,'requested');assert.equal(pending.production.program.match.title,original.match.title,'PGM is never exposed to the pending source configuration');
    assert.equal(pending.production.control.owner,owner.id,'ownership waits for the in-flight switch');
    const response=await take;assert.equal(response.status,200);const completed=await response.json();
    assert.equal(completed.production.application.status,delayed==='success'?'applied':'failed');assert.equal(completed.production.program.match.title,delayed==='success'?'Prepared title':original.match.title);
    assert.equal(completed.gameTime,original.gameTime+7,'fresh game telemetry is retained during the asynchronous preparation');
    assert.equal((await claim).status,200);assert.equal((await api.get()).production.control.owner,replacement.id);
    const saved=JSON.parse(await readFile(path.join(api.dir,'state.json'),'utf8'));assert.equal(saved.production.program.match.title,completed.production.program.match.title);
  }finally{await api.close();}
});

test('HTTP save failure stays visible and rejects a mutation acknowledgement',{timeout:20000},async()=>{
  const api=await service(true);try{
    const response=await api.post('/api/action',{type:'save-recording',title:'保存失败演练'});assert.equal(response.status,503);assert.match((await response.json()).error,/保存失败/);
    const state=await api.get();assert.equal(state.production.persistence.status,'failed');assert.equal(state.recordings[0].title,'保存失败演练','in-memory data remains available for recovery');
    await assert.rejects(readFile(path.join(api.dir,'state.json'),'utf8'));
    const archive=await fetch(api.base+'/api/archive').then(r=>r.json());assert.equal(archive.recordings[0].title,'保存失败演练');
  }finally{await api.close();}
});
