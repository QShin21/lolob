import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { diagnoseReplay, findReplayConfig, LocalApiError, replayEnabled, type LocalRequest, type ReplayConfig } from './replay';
import { Adapters, ChampionCatalog } from './adapters';
import { createSeed } from './state';

const disabled:ReplayConfig={path:'D:\\League\\Game\\Config\\game.cfg',enabled:false,modifiedAt:'2026-10-03T16:00:00Z'};
const missingReplay:LocalRequest=async(port,endpoint)=>{if(endpoint==='/replay/playback')throw new LocalApiError('HTTP 404','http',port,endpoint,404);return {paths:{'/liveclientdata/allgamedata':{get:{}}}};};

test('Replay 404 diagnosis distinguishes disabled configuration from restart and declared-but-unavailable routes',async()=>{
  const first=await diagnoseReplay(missingReplay,'',{config:disabled,skipDiscovery:true});assert.equal(first.status,'disabled');assert.equal(first.restartRequired,true);assert.match(first.detail,/EnableReplayApi=1/);assert.match(first.detail,/重新打开回放/);assert.equal(first.endpoints[0].statusCode,404);
  const enabled={...disabled,enabled:true};const restart=await diagnoseReplay(missingReplay,'',{config:enabled,gameProcess:{executablePath:'D:\\League\\Game\\League of Legends.exe',startedAt:'2026-10-03T15:00:00Z'},skipDiscovery:true});assert.equal(restart.status,'restart-required');assert.match(restart.detail,/启动早于配置修改/);
  const declared:LocalRequest=async(port,endpoint)=>{if(endpoint==='/replay/playback')throw new LocalApiError('HTTP 404','http',port,endpoint,404);return {paths:{'/replay/playback':{get:{},post:{}}}};};
  const unsupported=await diagnoseReplay(declared,'',{config:enabled,gameProcess:{executablePath:'D:\\League\\Game\\League of Legends.exe',startedAt:'2026-10-03T17:00:00Z'},skipDiscovery:true});assert.equal(unsupported.status,'unsupported');assert.deepEqual(unsupported.declaredReplayPaths,['/replay/playback']);assert.match(unsupported.detail,/Swagger 中声明/);
});

test('Replay readiness requires a playback schema and keeps unavailable client distinct from disabled API',async()=>{
  const ready=await diagnoseReplay(async()=>({paused:true,time:350,speed:1,length:1500}),'',{skipDiscovery:true});assert.equal(ready.status,'ready');assert.equal(ready.playback?.paused,true);
  const incompatible=await diagnoseReplay(async()=>({somethingElse:true}),'',{skipDiscovery:true});assert.equal(incompatible.status,'invalid-response');assert.equal(incompatible.playback,undefined);
  const refused=await diagnoseReplay(async(port,endpoint)=>{throw new LocalApiError('Connection refused','refused',port,endpoint);},'',{config:disabled,skipDiscovery:true});assert.equal(refused.status,'not-running');assert.match(refused.detail,/2999 游戏接口未启动/);
  const timeout=await diagnoseReplay(async(port,endpoint)=>{throw new LocalApiError('Timed out','timeout',port,endpoint);},'',{skipDiscovery:true});assert.equal(timeout.status,'unavailable');assert.match(timeout.detail,/超时/);
});

test('Replay configuration is read only from General and locates Game/Config with UTF16 support',async()=>{
  assert.equal(replayEnabled('[General]\r\nEnableReplayApi=1\r\n[Other]\r\nEnableReplayApi=0'),true);assert.equal(replayEnabled('[General]\n[Other]\nEnableReplayApi=1'),false);assert.equal(replayEnabled('[General]\nEnableReplayApi=1\nEnableReplayApi=0'),null);
  const directory=await mkdtemp(path.join(tmpdir(),'riftcast-replay-test-'));
  try{await mkdir(path.join(directory,'Game','Config'),{recursive:true});const file=path.join(directory,'Game','Config','game.cfg');await writeFile(file,Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('[General]\r\nEnableReplayApi=1\r\n','utf16le')]));const config=await findReplayConfig(directory);assert.equal(config?.path,file);assert.equal(config?.enabled,true);}
  finally{const absolute=path.resolve(directory);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('riftcast-replay-test-'));await rm(absolute,{recursive:true,force:true});}
});

test('Replay adapter reconnects after an unavailable interface becomes ready and reports POST failure separately',async()=>{
  const state=createSeed();let ready=false;let postUnavailable=false;const requests:{endpoint:string;method:string;body?:unknown}[]=[];
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(port,endpoint,options)=>{
    requests.push({endpoint,method:options?.method??'GET',body:options?.body});
    if(endpoint.includes('swagger'))return {paths:{'/replay/playback':{get:{},post:{}}}};
    if(!ready||postUnavailable&&options?.method==='POST')throw new LocalApiError('HTTP 404','http',port,endpoint,404);
    return {paused:false,time:150,speed:1,length:2000};
  });
  try{
    await assert.rejects(adapters.connect('replay'),/HTTP 404/);assert.equal(state.connections.replay.status,'error');assert.match(state.connections.replay.detail,/重新打开回放/);
    ready=true;await adapters.poll();assert.equal(state.connections.replay.status,'connected');const sampledAt=state.connections.replay.updatedAt;assert.ok(sampledAt);
    await adapters.replay({paused:true,speed:2,time:180});assert.deepEqual(requests.at(-1),{endpoint:'/replay/playback',method:'POST',body:{paused:true,speed:2,time:180}});
    postUnavailable=true;await assert.rejects(adapters.replay({paused:false}),/状态读取成功，但当前操作失败/);assert.equal(state.connections.replay.status,'error');assert.match(state.connections.replay.detail,/HTTP 404/);assert.ok(state.connections.replay.updatedAt);
  }finally{await adapters.close();}
});
