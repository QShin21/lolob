import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CinematicEngine, validTrack } from './cinematics';
import { cameraAt, cameraSequence, defaultController, nudgeCamera } from '../shared/cinematics';
import type { CameraTrack } from '../shared/cinematics';
import type { LocalRequest } from './replay';
import express from 'express';
import { registerCinematicRoutes } from './cinematics';
import { ControlSeats } from './control-seats';

const track=():CameraTrack=>({id:'track-1',name:'开场推进',frames:[
  {id:'a',time:10,position:{x:0,y:200,z:0},rotation:{x:10,y:350,z:0},fov:55,interpolation:'spline'},
  {id:'b',time:12,position:{x:100,y:300,z:400},rotation:{x:20,y:10,z:0},fov:65,interpolation:'linear'},
  {id:'c',time:14,position:{x:200,y:200,z:800},rotation:{x:10,y:30,z:0},fov:55,interpolation:'linear'},
]});
async function fixture(t:test.TestContext){
  const dataDir=await mkdtemp(path.join(tmpdir(),'riftcast-cinematic-'));
  const fake={pid:11,render:{cameraMode:'top',cameraAttached:false,cameraPosition:{x:0,y:200,z:0},cameraRotation:{x:10,y:350,z:0},fieldOfView:55,selectionName:''},
    playback:{time:10,speed:1,paused:true,seeking:false,length:600},sequence:{} as any,writes:[] as {route:string;body:any}[],ignoreRender:false,ignoreSequence:false,connected:true,
    data:{gameData:{gameTime:10},allPlayers:[{summonerName:'Alice',championName:'Ahri'}],events:{Events:[] as any[]}}};
  const request:LocalRequest=async(_port,route,options)=>{
    if(!fake.connected)throw new Error('unavailable');
    if(options?.method==='POST'){
      fake.writes.push({route,body:structuredClone(options.body)});
      if(route==='/replay/render'&&!fake.ignoreRender)Object.assign(fake.render,options.body);
      if(route==='/replay/playback')Object.assign(fake.playback,options.body);
      if(route==='/replay/sequence'&&!fake.ignoreSequence)fake.sequence=structuredClone(options.body);
    }
    if(route==='/replay/game')return {processID:fake.pid};
    if(route==='/replay/render')return structuredClone(fake.render);
    if(route==='/replay/playback')return structuredClone(fake.playback);
    if(route==='/replay/sequence')return structuredClone(fake.sequence);
    if(route==='/liveclientdata/allgamedata')return structuredClone(fake.data);
    throw new Error(route);
  };
  const engine=new CinematicEngine({dataDir,request,authorize:()=>{}});
  t.after(async()=>{await engine.close();await rm(dataDir,{recursive:true,force:true});});
  return {engine,fake,dataDir,request};
}

test('spline passes through anchors, interpolates rotation across wrap and samples native keyframes',()=>{
  const frames=track().frames;
  assert.deepEqual(cameraAt(frames,10).position,frames[0].position);
  assert.deepEqual(cameraAt(frames,12).position,frames[1].position);
  assert.equal(cameraAt(frames,11).rotation.y,360);
  const sequence=cameraSequence(track());assert.equal(sequence.cameraPosition.length,42);
  assert.equal(sequence.cameraPosition[0].time,10);assert.equal(sequence.cameraPosition.at(-1)!.time,14);
  assert.ok(sequence.cameraPosition.every((f,i,a)=>i===0||f.time>a[i-1].time));
  assert.ok(sequence.cameraRotation.every((f,i,a)=>i===0||Math.abs(f.value.y-a[i-1].value.y)<30));
});
test('cuts hold the starting camera until the next keyframe',()=>{
  const frames=track().frames;frames[0].interpolation='cut';
  assert.deepEqual(cameraAt(frames,11.99).position,frames[0].position);
  assert.deepEqual(cameraAt(frames,12).position,frames[1].position);
});
test('validation rejects duplicate times, oversized sequences and non-finite poses',()=>{
  const value=track();value.frames[1].time=value.frames[0].time;assert.throws(()=>validTrack(value),/相隔/);
  value.frames[1].time=11;value.frames[2].time=900;assert.throws(()=>validTrack(value),/10 分钟/);
  value.frames[2].time=14;value.frames[0].position.x=Infinity;assert.throws(()=>validTrack(value),/坐标/);
});
test('library persists with revision protection and a failed read cannot overwrite saved data',async t=>{
  const f=await fixture(t);const saved=await f.engine.command({action:'save',expectedRevision:0,track:track()});
  assert.equal(saved.library.revision,1);await assert.rejects(f.engine.command({action:'save',expectedRevision:0,track:track()}),/已更新/);
  const restored=new CinematicEngine({dataDir:f.dataDir,request:f.request,authorize:()=>{}});assert.equal((await restored.view()).library.tracks[0].name,'开场推进');
  await writeFile(path.join(f.dataDir,'cinematics.json'),'broken');const invalid=new CinematicEngine({dataDir:f.dataDir,request:f.request,authorize:()=>{}});
  await assert.rejects(invalid.command({action:'save',expectedRevision:0,track:track()}),/文件读取失败/);
  assert.equal(await readFile(path.join(f.dataDir,'cinematics.json'),'utf8'),'broken');
});
test('capture reads real pose without writes; stale sessions and unconfirmed camera writes fail',async t=>{
  const f=await fixture(t),v=await f.engine.view();
  const captured=await f.engine.command({action:'capture',session:v.session});assert.equal(captured.captured?.position.y,200);assert.equal(f.fake.writes.length,0);
  f.fake.pid=12;await assert.rejects(f.engine.command({action:'jump',session:v.session,pose:track().frames[1]}),/连接已变化/);assert.equal(f.fake.writes.length,0);
  const current=await f.engine.view();f.fake.ignoreRender=true;
  await assert.rejects(f.engine.command({action:'jump',session:current.session,pose:track().frames[1]}),/尚未确认镜头位置/);
});
test('play applies and verifies sequence before transport; stop clears it without pausing the game',async t=>{
  const f=await fixture(t),v=await f.engine.command({action:'save',expectedRevision:0,track:track()});
  const playing=await f.engine.command({action:'play',session:v.session,trackId:'track-1'});
  assert.equal(playing.activeTrackId,'track-1');assert.equal(f.fake.playback.paused,false);
  assert.equal(f.fake.sequence.cameraPosition.length,42);
  await f.engine.command({action:'stop',session:v.session});assert.deepEqual(f.fake.sequence,{});assert.equal(f.fake.playback.paused,false);
});
test('a successful HTTP response with an unapplied sequence does not report playback',async t=>{
  const f=await fixture(t),v=await f.engine.command({action:'save',expectedRevision:0,track:track()});f.fake.ignoreSequence=true;
  await assert.rejects(f.engine.command({action:'play',session:v.session,trackId:'track-1'}),/尚未确认镜头轨迹/);
  assert.equal((await f.engine.view()).activeTrackId,undefined);assert.equal(f.fake.playback.paused,true);
});
test('directed camera verifies current player identity and selection; auto follow baselines old events',async t=>{
  const f=await fixture(t),v=await f.engine.view();
  await assert.rejects(f.engine.command({action:'follow',session:v.session,name:'Gone'}),/离开/);
  f.fake.data.events.Events=[{EventName:'ChampionKill',EventTime:9,KillerName:'Alice',VictimName:'Bob'}];
  await f.engine.command({action:'auto',session:v.session,enabled:true});const count=f.fake.writes.length;
  await (f.engine as any).tickAuto();assert.equal(f.fake.writes.length,count);
  f.fake.data.gameData.gameTime=12;f.fake.data.events.Events.push({EventName:'DragonKill',EventTime:12,KillerName:'Alice'});
  await (f.engine as any).tickAuto();assert.equal(f.fake.render.selectionName,'Alice');assert.equal(f.fake.render.cameraAttached,true);
  await f.engine.command({action:'jump',session:v.session,pose:track().frames[0]});assert.equal((await f.engine.view()).autoFollow,false);
});
test('controller validates bindings and bounded motion, dolly keeps camera height',async t=>{
  const f=await fixture(t),config=defaultController();config.bindings.stop=config.bindings.play;
  await assert.rejects(f.engine.command({action:'controller',expectedRevision:0,controller:config}),/互不重复/);
  const pose=track().frames[0],moved=nudgeCamera(pose,'dolly',{x:1,y:1,z:1,yaw:1,pitch:0,dt:.1},defaultController());
  assert.equal(moved.position.y,pose.position.y);assert.equal(moved.rotation.y,pose.rotation.y);
  const v=await f.engine.view();await assert.rejects(f.engine.command({action:'nudge',session:v.session,mode:'free',axes:{x:2,y:0,z:0,yaw:0,pitch:0},dt:.1}),/横移/);
  f.fake.connected=false;assert.equal((await f.engine.view()).connected,false);
});
test('HTTP mutations require the current output owner; absent game preserves the editable library',async t=>{
  const f=await fixture(t),app=express(),seats=new ControlSeats();app.use(express.json());
  const director=seats.issue({role:'director'},true),data=seats.issue({role:'data',fresh:true},true);
  const engine=registerCinematicRoutes(app,{dataDir:f.dataDir,request:f.request,authorize:req=>seats.authorize(req.headers['x-seat-token'],'output')});
  app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(400).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(async()=>{await engine.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const request=(token:string,body:unknown)=>fetch(base+'/api/cinematics',{method:'POST',headers:{'content-type':'application/json','x-seat-token':token},body:JSON.stringify(body)});
  const rejected=await request(String(data.token),{action:'save',expectedRevision:0,track:track()});assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/主导播/);
  f.fake.connected=false;
  const saved=await request(String(director.token),{action:'save',expectedRevision:0,track:track()});assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.connected,false);assert.equal(result.library.tracks.length,1);
  const jump=await request(String(director.token),{action:'jump',session:'stale',pose:track().frames[0]});assert.equal(jump.status,400);assert.equal(f.fake.writes.length,0);
});
