import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {localDiagnosticReport} from '../shared/app-operations';
import {createFixture} from './test-support/fixture';
const {createUpdateService,releaseInfo,newer,releaseApi}=createRequire(import.meta.url)('../electron/update-service.cjs');
const bytes=Buffer.from('MZ-RiftCast-isolated-installer-sample');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const release=()=>({tag_name:'v1.5.0',draft:false,prerelease:false,published_at:'2026-10-22',assets:[{name:'RiftCast-Setup-1.5.0.exe',size:bytes.length,digest:`sha256:${sha(bytes)}`,browser_download_url:'https://github.com/QShin21/lolob/releases/download/v1.5.0/RiftCast-Setup-1.5.0.exe'}]});
const temporary=()=>mkdtemp(path.join(os.tmpdir(),'rift-update-'));
const fetcher=(body=bytes)=>(async(url:string)=>url===releaseApi?new Response(JSON.stringify(release())):new Response(body)) as typeof fetch;
test('release selection requires a formal version, one repository installer, size and SHA-256',()=>{
 assert.equal(releaseInfo(release()).sha256,sha(bytes));assert.equal(newer('1.10.0','1.9.9'),true);assert.equal(newer('1.4.0','1.4.0'),false);
 for(const bad of [{...release(),draft:true},{...release(),prerelease:true},{...release(),tag_name:'v1.5.0-beta'},{...release(),assets:[...release().assets,...release().assets]}])assert.throws(()=>releaseInfo(bad));
 for(const patch of [{digest:null},{size:-1},{name:'../../evil.exe'},{browser_download_url:'https://evil.example/install.exe'},{browser_download_url:'https://github.com/Other/repo/releases/download/v1.5.0/RiftCast-Setup-1.5.0.exe'}])assert.throws(()=>releaseInfo({...release(),assets:[{...release().assets[0],...patch}]}));
});
test('verified download publishes once and reuses only identical existing installer',async()=>{
 const dir=await temporary();const service=createUpdateService({currentVersion:'1.4.0',downloadsDir:dir,fetch:fetcher()});
 try{service.check();assert.equal((await service.settled()).phase,'available');service.download();const result=await service.settled();assert.equal(result.phase,'ready');assert.equal(result.received,bytes.length);assert.deepEqual(await readFile(result.path),bytes);assert.deepEqual(await readdir(dir),['RiftCast-Setup-1.5.0.exe']);service.download();assert.equal((await service.settled()).phase,'ready');}finally{await rm(dir,{recursive:true,force:true});}
});
test('corruption, truncation and extra bytes leave no executable or partial file',async()=>{
 for(const bad of [Buffer.alloc(bytes.length),bytes.subarray(0,10),Buffer.concat([bytes,Buffer.from('x')])]){const dir=await temporary(),service=createUpdateService({currentVersion:'1.4.0',downloadsDir:dir,fetch:fetcher(bad)});try{service.check();await service.settled();service.download();assert.equal((await service.settled()).phase,'error');assert.deepEqual(await readdir(dir),[]);}finally{await rm(dir,{recursive:true,force:true});}}
});
test('same-name different hash remains untouched and cannot be bypassed on retry',async()=>{
 const dir=await temporary(),file=path.join(dir,release().assets[0].name);await writeFile(file,'user-installer');const service=createUpdateService({currentVersion:'1.4.0',downloadsDir:dir,fetch:fetcher()});try{service.check();await service.settled();service.download();assert.equal((await service.settled()).phase,'error');assert.equal(await readFile(file,'utf8'),'user-installer');service.download();assert.equal((await service.settled()).phase,'error');}finally{await rm(dir,{recursive:true,force:true});}
});
test('download cancellation removes its partial file and permits a clean retry',async()=>{
 const dir=await temporary();let entered!:()=>void;const starting=new Promise<void>(resolve=>entered=resolve);let pending=true;
 const service=createUpdateService({currentVersion:'1.4.0',downloadsDir:dir,fetch:async(url:string,options:{signal:AbortSignal})=>{if(url===releaseApi)return new Response(JSON.stringify(release()));if(!pending)return new Response(bytes);return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.subarray(0,5));entered();options.signal.addEventListener('abort',()=>controller.error(new Error('aborted')),{once:true});}}));}});
 try{service.check();await service.settled();service.download();await starting;service.cancel();assert.equal((await service.settled()).phase,'cancelled');assert.deepEqual(await readdir(dir),[]);pending=false;service.download();assert.equal((await service.settled()).phase,'ready');}finally{await rm(dir,{recursive:true,force:true});}
});
test('updater accepts GitHub asset redirect only and rejects external redirect and concurrent requests',async()=>{
 for(const allowed of [false,true]){const dir=await temporary();let finish!:()=>void;const waiting=new Promise<void>(r=>finish=r);const service=createUpdateService({currentVersion:'1.4.0',downloadsDir:dir,fetch:async(url:string)=>{if(url===releaseApi){await waiting;return new Response(JSON.stringify(release()));}if(url.startsWith('https://github.com/'))return new Response(null,{status:302,headers:{location:allowed?'https://release-assets.githubusercontent.com/asset':'https://example.com/file'}});return new Response(bytes);}});try{service.check();assert.throws(()=>service.check(),/正在进行/);finish();await service.settled();service.download();assert.equal((await service.settled()).phase,allowed?'ready':'error');if(!allowed)assert.deepEqual(await readdir(dir),[]);}finally{finish();await rm(dir,{recursive:true,force:true});}}
});
test('diagnostic report selects status fields while removing identity, secrets, paths and raw details',()=>{
 const state=createFixture();state.settings.obsPassword='SECRET_PASSWORD';state.settings.lockfilePath='C:\\private\\lockfile';state.connections.obs.detail='PRIVATE_STREAM_URL';state.players[0].name='PRIVATE_NAME';state.teams[0].name='PRIVATE_TEAM';state.teams[0].players[0].account='PRIVATE_ACCOUNT';
 const report=localDiagnosticReport(state,'1.4.0',0);for(const value of ['SECRET_PASSWORD','private','PRIVATE_STREAM_URL','PRIVATE_NAME','PRIVATE_TEAM','PRIVATE_ACCOUNT'])assert(!report.includes(value));const parsed=JSON.parse(report);assert.equal(parsed.version,'1.4.0');assert.equal(parsed.counts.players,10);assert.equal(parsed.connections.obs,state.connections.obs.status);assert(!('settings'in parsed));
});
