import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createSeed, applyAction, resetRuntimeState, csvRecording } from './state';
import { ObsProduction } from './obs-production';
import type { ObsClient } from './obs-client';
import { engineScene, enginePreviewScene } from './obs-engine';
import { emergencyScene, prepareEmergencyCollection } from './obs-emergency';
import { writeDurableState } from './durable-state';
import { ResourceCache, resourceUrl } from './resource-cache';
import { objectiveRemaining, productionKey } from '../shared/production';
import { updateAlerts } from './production';

class ProductionObsFixture extends EventEmitter {
  calls:{type:string;data:any}[]=[];
  scenes=new Set([engineScene,enginePreviewScene,emergencyScene]);
  inputs=new Map<string,boolean>([['RiftCast 桌面音频',false],['RiftCast 解说麦克风',true]]);
  scene=engineScene; buffer=false; recording=false; reconnecting=false;
  lastFile=''; nextFile=''; cursor=0; outputDuration=0; failure='';
  async call(type:string,data:any={}) {
    this.calls.push({type,data});if(this.failure===type)throw new Error('Fixture OBS failure');
    switch(type){
      case 'GetInputList':return {inputs:[...this.inputs.keys()].map(inputName=>({inputName}))};
      case 'GetInputMute':return {inputMuted:this.inputs.get(data.inputName)??false};
      case 'SetInputMute':this.inputs.set(data.inputName,data.inputMuted);return {};
      case 'GetInputVolume':return {inputVolumeDb:0};
      case 'GetInputAudioMonitorType':return {monitorType:'OBS_MONITORING_TYPE_NONE'};
      case 'GetInputAudioSyncOffset':return {inputAudioSyncOffset:0};
      case 'GetRecordStatus':return {outputActive:this.recording,outputDuration:this.outputDuration};
      case 'GetRecordDirectory':return {recordDirectory:tmpdir()};
      case 'GetStreamStatus':return {outputActive:false,outputReconnecting:this.reconnecting};
      case 'GetReplayBufferStatus':return {outputActive:this.buffer};
      case 'StartReplayBuffer':this.buffer=true;return {};
      case 'StopReplayBuffer':this.buffer=false;return {};
      case 'GetLastReplayBufferReplay':return {savedReplayPath:this.lastFile};
      case 'SaveReplayBuffer':this.lastFile=this.nextFile;return {};
      case 'GetSceneList':return {currentProgramSceneName:this.scene,scenes:[...this.scenes].map(sceneName=>({sceneName}))};
      case 'CreateScene':this.scenes.add(data.sceneName);return {};
      case 'CreateInput':this.inputs.set(data.inputName,false);return {sceneItemId:1};
      case 'GetSceneItemList':return {sceneItems:[]};
      case 'GetMediaInputStatus':return {mediaDuration:60000,mediaCursor:this.cursor,mediaState:'OBS_MEDIA_STATE_PLAYING'};
      case 'SetMediaInputCursor':this.cursor=data.mediaCursor;return {};
      case 'SetCurrentProgramScene':this.scene=data.sceneName;return {};
      case 'GetCurrentProgramScene':return {sceneName:this.scene};
      default:return {};
    }
  }
}
async function fixtureDir(){return mkdtemp(path.join(tmpdir(),'riftcast-production-test-'));}
async function cleanup(dir:string){const absolute=path.resolve(dir);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('riftcast-production-test-'));await rm(absolute,{recursive:true,force:true,maxRetries:3});}

test('independent OBS clip previews, trims, restores audio and returns at its out-point',async()=>{
  const dir=await fixtureDir();try{
    const file=path.join(dir,'fixture.mkv');await writeFile(file,Buffer.alloc(4096));
    const s=createSeed(),obs=new ProductionObsFixture(),production=new ObsProduction(obs as unknown as ObsClient,()=>s,work=>work(s));
    await production.control({action:'start-buffer'});assert.equal(obs.buffer,true);
    obs.nextFile=file;await production.control({action:'save-clip'});const clip=s.production!.clips[0];assert.equal(clip.key,productionKey(s));
    await assert.rejects(production.control({action:'play-clip',id:clip.id}),/预监/);
    await production.control({action:'prepare-clip',id:clip.id});assert.equal(clip.duration,60);assert.equal(clip.status,'ready');
    assert.equal(obs.calls.some(c=>c.type==='SetCurrentPreviewScene'),false,'main game PVW remains available');
    await production.control({action:'edit-clip',id:clip.id,inPoint:5,outPoint:7,audio:'original'});
    await production.control({action:'play-clip',id:clip.id});assert.equal(obs.cursor,5000);assert.equal(obs.scene,'RiftCast 回放');
    assert.equal(obs.inputs.get('RiftCast 桌面音频'),true);assert.equal(obs.inputs.get('RiftCast 解说麦克风'),true);assert.equal(obs.inputs.get('RiftCast 回放片段'),false);
    await assert.rejects(production.control({action:'prepare-clip',id:clip.id}),/先回到比赛/);
    obs.cursor=7200;await production.tick();assert.equal(obs.scene,engineScene);assert.equal(s.production!.playingClipId,undefined);
    assert.equal(obs.inputs.get('RiftCast 桌面音频'),false);assert.equal(obs.inputs.get('RiftCast 解说麦克风'),true);assert.equal(clip.status,'aired');
    assert.equal(obs.calls.some(c=>c.data.inputName==='RiftCast HUD'&&c.data.sceneName==='RiftCast 回放'),false,'clip scene carries recorded graphics and a replay label');
  }finally{await cleanup(dir);}
});

test('clip buffers index the on-air game while later-game content is being prepared',async()=>{
  const dir=await fixtureDir();try{
    const obs=new ProductionObsFixture();obs.nextFile=path.join(dir,'buffer.mkv');await writeFile(obs.nextFile,Buffer.alloc(4096));
    let s=createSeed();const key=productionKey(s);s=applyAction(s,{type:'finalize-game',winner:'red'});s=applyAction(s,{type:'next-game'});
    const production=new ObsProduction(obs as unknown as ObsClient,()=>s,work=>work(s));await production.control({action:'save-clip'});
    assert.equal(s.production!.clips[0].key,key);assert.notEqual(key,productionKey(s));
    await production.control({action:'prepare-clip',id:s.production!.clips[0].id});
  }finally{await cleanup(dir);}
});

test('failed media switch restores original sound policy; emergency and track changes confirm actual output',async()=>{
  const dir=await fixtureDir();try{
    const s=createSeed(),obs=new ProductionObsFixture(),production=new ObsProduction(obs as unknown as ObsClient,()=>s,work=>work(s));
    obs.nextFile=path.join(dir,'buffer.mkv');await writeFile(obs.nextFile,Buffer.alloc(4096));
    await production.control({action:'save-clip'});const clip=s.production!.clips[0];await production.control({action:'prepare-clip',id:clip.id});
    obs.failure='SetMediaInputCursor';await assert.rejects(production.control({action:'play-clip',id:clip.id}));
    assert.equal(obs.scene,engineScene);assert.equal(obs.inputs.get('RiftCast 桌面音频'),false);assert.equal(s.production!.playingClipId,undefined);
    obs.failure='';await production.control({action:'emergency',reason:'模拟信号故障'});assert.equal(obs.scene,emergencyScene);assert.equal(s.production!.pause!.kind,'signal');
    await production.control({action:'return-live'});assert.equal(obs.scene,engineScene);
    obs.reconnecting=true;await assert.rejects(production.control({action:'tracks'}),/停播/);
    assert.equal(obs.calls.some(c=>c.type==='SetInputAudioTracks'),false);
  }finally{await cleanup(dir);}
});

test('continuous recording maps game and video time segments to a verified file',async()=>{
  const dir=await fixtureDir();try{
    let s=createSeed();const obs=new ProductionObsFixture(),production=new ObsProduction(obs as unknown as ObsClient,()=>s,work=>work(s));
    obs.recording=true;await production.recordingChanged('start-record',s);const group=s.production!.videos[0].recordingId;
    s=applyAction(s,{type:'finalize-game',winner:'red'});s=applyAction(s,{type:'next-game'});s=applyAction(s,{type:'take',scene:'draft'});
    obs.outputDuration=15000;await production.recordingSegment();assert.equal(s.production!.videos.length,2);
    assert.equal(s.production!.videos[0].endVideoSeconds,15);assert.equal(s.production!.videos[1].startVideoSeconds,15);assert.equal(s.production!.videos[1].recordingId,group);
    const file=path.join(dir,'continuous.mkv');await writeFile(file,Buffer.alloc(4096));await production.recordingChanged('stop-record',s,file);
    assert.ok(s.production!.videos.every(v=>v.file===file&&v.bytes===4096&&v.verified&&v.playable===undefined));
  }finally{await cleanup(dir);}
});

test('durable state replacement reopens correctly and failed replacement rejects without losing prior state',async()=>{
  const dir=await fixtureDir();try{
    const file=path.join(dir,'state.json');await writeDurableState(file,{revision:1});await writeDurableState(file,{revision:2});assert.equal(JSON.parse(await readFile(file,'utf8')).revision,2);
    const blocked=path.join(dir,'blocked.json');await mkdir(blocked);await writeFile(path.join(blocked,'preserved.txt'),'keep');
    await assert.rejects(writeDurableState(blocked,{revision:3}));assert.equal(await readFile(path.join(blocked,'preserved.txt'),'utf8'),'keep');
  }finally{await cleanup(dir);}
});

test('OBS emergency collection stays native and keeps existing scenes when prepared repeatedly',async()=>{
  const dir=await fixtureDir();try{
    const file=path.join(dir,'collection.json');await writeFile(file,JSON.stringify({sources:[{name:'Existing game scene',id:'scene'}],scene_order:[{name:'Existing game scene'}]}));
    await prepareEmergencyCollection(file,dir);await prepareEmergencyCollection(file,dir);const collection=JSON.parse(await readFile(file,'utf8'));
    assert.equal(collection.sources.filter((s:any)=>s.name===emergencyScene).length,1);assert.ok(collection.sources.some((s:any)=>s.name==='Existing game scene'));
    const scene=collection.sources.find((s:any)=>s.name===emergencyScene),image=collection.sources.find((s:any)=>s.name==='RiftCast 本地备用图');
    assert.equal(image.id,'image_source');assert.equal(scene.hotkeys['OBSBasic.SelectScene'][0].key,'OBS_KEY_P');assert.ok(scene.hotkeys['OBSBasic.SelectScene'][0].alt);
    const info=await sharp(image.settings.file).metadata();assert.equal(info.width,1920);assert.equal(info.height,1080);
    assert.equal(collection.sources.some((s:any)=>s.id==='browser_source'),false);
  }finally{await cleanup(dir);}
});

test('offline assets are pinned, cached once across concurrent readers, and reused without a network',async()=>{
  const dir=await fixtureDir(),original=globalThis.fetch;let requests=0;
  try{
    const cache=new ResourceCache(dir),url='https://ddragon.leagueoflegends.com/cdn/16.19.1/data/zh_CN/item.json';
    await assert.rejects(cache.read(url,true),/尚未缓存/);
    globalThis.fetch=(async()=>{requests++;await new Promise(r=>setTimeout(r,20));return new Response('{"data":{}}');}) as typeof fetch;
    await Promise.all([cache.read(url),cache.read(url)]);assert.equal(requests,1);
    globalThis.fetch=(async()=>{throw new Error('offline');}) as typeof fetch;
    assert.deepEqual(JSON.parse((await cache.read(url,true)).bytes.toString()),{data:{}});
    for(const url of ['https://example.com/a.json','https://ddragon.leagueoflegends.com/api/versions.json','https://ddragon.leagueoflegends.com/cdn/latest/data/zh_CN/item.json','https://ddragon.leagueoflegends.com/cdn/16.19.1/img/item/1.png?token=x'])assert.throws(()=>resourceUrl(url));
  }finally{globalThis.fetch=original;await cleanup(dir);}
});

test('manual BP survives restart while game statistics are invalidated; new series starts at zero',()=>{
  let s=createSeed();s.mode='live';s.phase='draft';s=applyAction(s,{type:'production',command:{op:'draft-mode',mode:'manual'}});
  const draft=structuredClone(s.draft);resetRuntimeState(s);assert.deepEqual(s.draft,draft);assert.equal(s.phase,'draft');assert.ok(s.players.every(p=>p.statsAvailable===false&&p.gold===null));
  s=applyAction(s,{type:'set-match',patch:{seriesId:'fresh-series'}});assert.deepEqual([s.match.game,s.match.blueScore,s.match.redScore],[1,0,0]);
});

test('resource countdown expires with the game version, stale clock and replay discontinuity',()=>{
  let s=createSeed();s.production!.versions.game='16.19';s.gameClock={source:'live',gameTime:s.gameTime,sampledAt:new Date().toISOString(),speed:1,paused:false,sessionId:'one',discontinuity:0,matchKey:'one',validForMs:3000};
  s=applyAction(s,{type:'production',command:{op:'objective',label:'人工资源记录',reason:'裁判核对本场版本',dueTime:s.gameTime+300}});const objective=s.production!.objectives[0];
  assert.equal(objectiveRemaining(s,objective),300);s.production!.versions.game='16.20';assert.equal(objectiveRemaining(s,objective),null);s.production!.versions.game='16.19';s.gameClock!.discontinuity++;assert.equal(objectiveRemaining(s,objective),null);
  s.gameClock!.discontinuity--;assert.equal(objectiveRemaining(s,objective,Date.now()+5000),null);
});

test('alerts acknowledge one incident, resolve independently and reopen for a later recurrence',()=>{
  let s=createSeed();assert.equal(updateAlerts(s,'output',['渲染告警']),true);const id=s.production!.alerts![0].id;
  s=applyAction(s,{type:'production',command:{op:'ack-alert',id}});assert.ok(s.production!.alerts![0].acknowledgedAt);assert.equal(updateAlerts(s,'output',['渲染告警']),false);
  updateAlerts(s,'output',[]);assert.ok(s.production!.alerts![0].resolvedAt);updateAlerts(s,'output',['渲染告警']);assert.notEqual(s.production!.alerts![1].id,id);assert.equal(s.production!.alerts![1].acknowledgedAt,undefined);
});

test('result CSV tracks corrections and invalid remake attempts consistently with JSON',()=>{
  let s=applyAction(createSeed(),{type:'finalize-game',winner:'red'});const id=s.gameResults![0].id;
  s=applyAction(s,{type:'correct-result',resultId:id,winner:'blue',reason:'裁判确认'});const csv=csvRecording(s.recordings[0]);assert.match(csv,/"胜方","blue"/);assert.match(csv,/"结果修订版本","2"/);
  s=applyAction(s,{type:'production',command:{op:'remake',reason:'裁判宣布作废'}});assert.equal(s.recordings[0].result!.valid,false);assert.match(csvRecording(s.recordings[0]),/"有效结果","已作废"/);assert.equal(s.production!.invalidAttempts[0].result!.snapshot.result!.valid,false);
  const incomplete=structuredClone(s.recordings[0]);incomplete.mode='live';incomplete.players[0].statsAvailable=false;incomplete.players[0].kills=999;
  const missingRow=csvRecording(incomplete).split('\r\n').find(row=>row.includes(`"${incomplete.players[0].name}"`))!;
  assert.ok(missingRow.includes('"不可用","不可用","不可用","不可用","不可用"'));assert.equal(missingRow.includes('"999"'),false);
});

test('audio peak hold expires and disconnected or stale samples remain unavailable',async t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);
 const s=createSeed(),obs=new ProductionObsFixture(),production=new ObsProduction(obs as unknown as ObsClient,()=>s,work=>work(s));
 const meter=(peak:number)=>obs.emit('InputVolumeMeters',{inputs:[{inputName:'RiftCast 桌面音频',inputLevelsMul:[[peak]]}]});
 meter(.9);now=2000;meter(.1);let bus=(await production.status()).audio[0];
 assert.ok(bus.available&&'heldPeakDb' in bus&&Math.abs(bus.heldPeakDb!-20*Math.log10(.9))<.001);assert.equal('peakDb' in bus&&bus.peakDb,-20);
 now=5000;meter(.2);bus=(await production.status()).audio[0];assert.equal('heldPeakDb' in bus&&bus.heldPeakDb,'peakDb' in bus&&bus.peakDb);
 now=7100;bus=(await production.status()).audio[0];assert.equal('meterAvailable' in bus&&bus.meterAvailable,false);
 obs.emit('ConnectionClosed');assert.equal('peakDb' in (await production.status()).audio[0],false);
});
