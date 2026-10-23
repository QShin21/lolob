import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {ResourceCache} from './resource-cache';
import {availableResourceVersions,mountResourceMaintenanceRoutes} from './resource-maintenance';
import express from 'express';
import {resourceVersionMatch} from '../shared/resource-maintenance';

test('real game build maps only its own numeric patch and leaves unknown versions unresolved',async()=>{
 const versions=['16.21.1','16.20.1','16.20.2','15.20.1'];assert.equal(resourceVersionMatch('16.20.123.456',versions),'16.20.2');assert.equal(resourceVersionMatch('26.20',versions),undefined);
 const fetcher=(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).includes('/realms/')?{v:'16.21.1'}:versions))) as typeof fetch;
 assert.equal((await availableResourceVersions('16.20.456','kr',fetcher)).recommended,'16.20.2');assert.equal((await availableResourceVersions('','kr',fetcher)).recommended,'16.21.1');assert.equal((await availableResourceVersions('99.1','kr',fetcher)).recommended,undefined);
 await assert.rejects(availableResourceVersions('16.20','cn',fetcher));
});
test('preparation reports truthful stage counts and prevents concurrent maintenance',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'rift-resource-'));let calls=0;let release!:()=>void,enter!:()=>void;const started=new Promise<void>(r=>release=r),entered=new Promise<void>(r=>enter=r);let stage='';
 const cache=new ResourceCache(dir,{fetch:(async(input:RequestInfo|URL)=>{calls++;const url=String(input);if(calls===1){stage=cache.status().phase;enter();await started;}
  const data=url.endsWith('item.json')?{data:{}}:url.endsWith('summoner.json')?{data:{}}:url.endsWith('champion.json')?{data:{}}:[];return new Response(JSON.stringify(data));}) as typeof fetch});
 try{const pending=cache.prepare('16.20.1');await entered;assert.equal(stage,'catalog');await assert.rejects(cache.prepare('16.20.1'),/正在维护/);await assert.rejects(cache.cleanup([],true),/正在维护/);release();const result=await pending;assert.equal(result.total,4);assert.equal(result.failed.length,0);assert.equal(cache.status().phase,'complete');assert.equal(cache.status().completed,4);assert.equal(calls,4);assert.equal(cache.status().failed,0);}finally{release();await rm(dir,{recursive:true,force:true});}
});
test('failed base directory leaves an error progress and a subsequent request can retry',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'rift-resource-'));const cache=new ResourceCache(dir,{fetch:(async()=>new Response('unavailable',{status:503})) as typeof fetch});
 try{await assert.rejects(cache.prepare('16.20.1'));assert.equal(cache.status().phase,'error');await assert.rejects(cache.prepare('bad'),/格式/);}finally{await rm(dir,{recursive:true,force:true});}
});
test('retention cleanup protects active versions, fresh reads, legacy files and shared rune assets',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'rift-resource-'));let now=Date.parse('2026-10-01T00:00:00Z');const cache=new ResourceCache(dir,{now:()=>now,fetch:(async()=>new Response('{"data":{}}')) as typeof fetch});
 const url=(version:string)=>`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/item.json`,key=(u:string)=>createHash('sha256').update(u).digest('hex');
 try{
  for(const v of ['16.18.1','16.19.1','16.20.1'])await cache.read(url(v));
  await writeFile(path.join(dir,'legacy-cache'),'keep');now+=15*86400000;await cache.read(url('16.19.1'),true);
  const dry=await cache.cleanup(['16.20.1']);assert.equal(dry.files,1);assert.equal(dry.removed,false);await access(path.join(dir,key(url('16.18.1'))));
  const removed=await cache.cleanup(['16.20.1'],true);assert.equal(removed.files,1);assert.equal(removed.removed,true);await assert.rejects(access(path.join(dir,key(url('16.18.1')))));
  await access(path.join(dir,key(url('16.19.1'))));await access(path.join(dir,key(url('16.20.1'))));assert.equal(await readFile(path.join(dir,'legacy-cache'),'utf8'),'keep');
  const invalid=key(url('16.17.1'));await writeFile(path.join(dir,invalid),'retain');await writeFile(path.join(dir,invalid+'.meta.json'),JSON.stringify({url:'https://example.com/invalid',lastUsedAt:'2000-01-01'}));assert.equal((await cache.cleanup(['16.20.1'],true)).files,0);await access(path.join(dir,invalid));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('maintenance rechecks ownership after a delayed output-status check before touching resources',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'rift-resource-auth-'));let owner=true,requests=0,release!:()=>void,enter!:()=>void;
 const entered=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>release=r);
 const cache=new ResourceCache(dir,{fetch:(async()=>{requests++;throw new Error('unauthorized download');}) as typeof fetch});
 const app=express();app.use(express.json());mountResourceMaintenanceRoutes(app,{cache,authorize:()=>{if(!owner)throw new Error('ownership changed');},beforeMutation:async()=>{enter();await held;},getGameVersion:()=>'',getProtectedVersions:()=>[]});
 app.use((e:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(403).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const port=(server.address() as {port:number}).port,pending=fetch(`http://127.0.0.1:${port}/api/resources/maintenance`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'prepare',version:'16.20.1'})});await entered;owner=false;release();const response=await pending;assert.equal(response.status,403);assert.equal(requests,0);assert.equal(cache.status().phase,'idle');}
 finally{release();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
