import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DisplayGameClock, displayClockInput, gameClockMatchKey, type DisplayClockInput } from '../shared/game-clock';
import { Adapters, ChampionCatalog } from './adapters';
import { applyAction, createSeed } from './state';

const wallBase=1_000_000;
function reading(time:number,at=0,patch:Partial<DisplayClockInput>={}):DisplayClockInput{return {time,sampledAt:new Date(wallBase+at).toISOString(),speed:1,paused:false,connected:true,sessionKey:'live-session-1',sampleKey:`${at}:${time}`,validForMs:4500,...patch};}

test('1500 ms polling displays every intervening second without changing real samples',()=>{
  const clock=new DisplayGameClock();const seconds:number[]=[];let sample=reading(241);
  for(let elapsed=0;elapsed<=10000;elapsed+=50){if(elapsed%1500===0){sample=reading(241+elapsed/1000,elapsed);clock.update(sample,elapsed,wallBase+elapsed);}seconds.push(Math.floor(clock.read(elapsed)));}
  assert.ok(seconds.includes(242),'04:02 is displayed between 04:01 and 04:03');
  for(let index=1;index<seconds.length;index++)assert.ok(seconds[index]-seconds[index-1]>=0&&seconds[index]-seconds[index-1]<=1,'Normal playback never skips or reverses a displayed second');
  assert.equal(sample.time,250,'Latest real sampling value stays unchanged');assert.equal(clock.read(10000),251);
});

test('integer sampling jitter is corrected while the display remains monotonic',()=>{
  const clock=new DisplayGameClock();let previous=241;
  for(let elapsed=0;elapsed<=9000;elapsed+=50){if(elapsed%1500===0)clock.update(reading(241+Math.floor(elapsed/1000),elapsed),elapsed,wallBase+elapsed);const value=clock.read(elapsed);assert.ok(value>=previous-1e-9);assert.ok(Math.abs(value-(241+elapsed/1000))<1);previous=value;}
});

test('Replay speed, pause and resume preserve the sampled game-time anchor',()=>{
  const clock=new DisplayGameClock();clock.update(reading(600,0,{speed:8}),0,wallBase);assert.equal(clock.read(1000),608);
  clock.update(reading(608.8,1100,{speed:8,paused:true}),1100,wallBase+1100);assert.equal(clock.read(5000),608.8);
  clock.update(reading(608.8,5200,{speed:2}),5200,wallBase+5200);assert.equal(clock.read(6200),610.8);
});

test('seek discontinuities and new matches re-anchor in both directions',()=>{
  const clock=new DisplayGameClock();clock.update(reading(600),0,wallBase);assert.equal(clock.read(1000),601);
  clock.update(reading(100,1000,{sessionKey:'live-session-seek-1'}),1000,wallBase+1000);assert.equal(clock.read(1000),100);
  clock.update(reading(1800,2000,{sessionKey:'live-session-seek-2'}),2000,wallBase+2000);assert.equal(clock.read(2000),1800);
  clock.update(reading(0,2500,{sessionKey:'new-match'}),2500,wallBase+2500);assert.equal(clock.read(3000),.5);
});

test('source expiry and transport loss freeze the display until fresh data arrives',()=>{
  const stale=new DisplayGameClock();stale.update(reading(100,0,{validForMs:3000}),0,wallBase);assert.equal(stale.read(10000),103);
  const clock=new DisplayGameClock();const source=reading(200,0,{validForMs:10000});clock.update(source,0,wallBase);clock.update({...source,connected:false},1250,wallBase+1250);assert.equal(clock.read(10000),201.25);
  clock.update(reading(203,3000),3000,wallBase+3000);assert.equal(clock.read(4000),204);
});

test('network age is applied once and subsequent progress uses monotonic time',()=>{
  const clock=new DisplayGameClock();const source=reading(100,2000);clock.update(source,7000,wallBase+2250);assert.equal(clock.read(7000),100.25);assert.equal(clock.read(8000),101.25);assert.equal(source.time,100);
});

test('clock metadata follows actual source status and cannot leak across modes or matches',()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=91;state.connections.replay.status='connected';state.gameClock={source:'replay',gameTime:100,sampledAt:new Date(wallBase).toISOString(),speed:4,paused:false,sessionId:'session',discontinuity:0,matchKey:gameClockMatchKey(state),validForMs:4500};
  assert.equal(displayClockInput(state).time,100);assert.equal(displayClockInput(state).speed,4);assert.equal(displayClockInput(state,false).connected,false);
  state.connections.replay.status='error';assert.equal(displayClockInput(state).connected,false);
  state.match.game++;assert.equal(displayClockInput(state).time,91);assert.equal(displayClockInput(state).speed,0);
  state.mode='demo';state.gameTime=42;state.paused=true;assert.equal(displayClockInput(state).time,42);assert.equal(displayClockInput(state).paused,true);
});

test('malformed sample validity cannot keep an unbounded display clock running',()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=91;state.connections.live.status='connected';state.gameClock={source:'live',gameTime:100,sampledAt:new Date(wallBase).toISOString(),speed:1,paused:false,sessionId:'session',discontinuity:0,matchKey:gameClockMatchKey(state),validForMs:NaN};
  assert.equal(displayClockInput(state).connected,false);assert.equal(displayClockInput(state).time,91);
});

test('adapters publish actual Live and Replay clocks while preserving gameTime recording semantics',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.programScene='standby';let liveTime=241.5;let replayAvailable=true;let playback={time:900.25,speed:2,paused:true};
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(_port,endpoint,options)=>{
    if(endpoint==='/liveclientdata/allgamedata')return {allPlayers:[{riotId:'Clock#Fixture',championName:'Ahri',team:'ORDER',scores:{kills:0,deaths:0,assists:0,creepScore:0}}],gameData:{gameTime:liveTime},events:{Events:[]}};
    if(endpoint==='/replay/playback'){if(!replayAvailable)throw new Error('fixture replay disconnected');if(options?.method==='POST')playback={...playback,...options.body as typeof playback};return {...playback};}
    throw new Error(`Unexpected fixture endpoint ${endpoint}`);
  });
  try{
    await adapters.connect('live');assert.equal(state.gameTime,241.5);assert.equal(state.gameClock?.source,'live');assert.equal(state.gameClock?.gameTime,241.5);assert.equal(state.gameClock?.speed,1);
    await adapters.connect('replay');assert.equal(state.gameClock?.source,'replay');assert.equal(state.gameClock?.gameTime,900.25);assert.equal(state.gameClock?.speed,2);assert.equal(state.gameClock?.paused,true);assert.equal(state.gameTime,241.5);
    await adapters.replay({time:600,speed:4,paused:true});assert.equal(state.gameClock?.gameTime,600);assert.equal(state.gameClock?.awaitingLiveSample,true);assert.ok(state.gameClock!.discontinuity>0);assert.equal(state.gameTime,241.5);
    await adapters.poll();assert.equal(state.gameClock?.awaitingLiveSample,true,'Old Live frame cannot clear the seek barrier');
    liveTime=600;await adapters.poll();assert.notEqual(state.gameClock?.awaitingLiveSample,true);assert.equal(state.gameTime,600);
    replayAvailable=false;await adapters.poll();assert.equal(state.connections.replay.status,'error');assert.equal(displayClockInput(state).connected,false);assert.equal(state.gameTime,600);
    replayAvailable=true;await adapters.connect('replay');assert.equal(state.connections.replay.status,'connected');assert.equal(state.gameClock?.paused,true);
  }finally{await adapters.close();}
});

test('expired Replay metadata yields a fresh frozen Live anchor and runtime resets clear the old session',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.programScene='standby';state.settings.pollInterval=500;let liveTime=120;let replayAvailable=true;let playback={time:120,speed:8,paused:false};
  const adapters=new Adapters(()=>state,work=>work(state),new ChampionCatalog('.'),async(_port,endpoint,options)=>{
    if(endpoint==='/liveclientdata/allgamedata')return {allPlayers:[{riotId:'Clock#Fixture',championName:'Ahri',team:'ORDER',scores:{kills:0,deaths:0,assists:0,creepScore:0}}],gameData:{gameTime:liveTime},events:{Events:[]}};
    if(endpoint==='/replay/playback'){if(!replayAvailable)throw new Error('fixture replay disconnected');if(options?.method==='POST')playback={...playback,...options.body as typeof playback};return {...playback};}
    throw new Error(`Unexpected fixture endpoint ${endpoint}`);
  });
  try{
    await adapters.connect('live');await adapters.connect('replay');const sessionId=state.gameClock!.sessionId;assert.equal(state.gameClock?.source,'replay');
    await adapters.replay({time:600});const display=new DisplayGameClock();display.update(displayClockInput(state),0,Date.now());const beforeFailure=display.read(250);
    replayAvailable=false;await adapters.poll();assert.equal(state.gameClock?.source,'replay','A fresh source sample is retained during a source failure');assert.equal(displayClockInput(state).connected,false);display.update(displayClockInput(state),250,Date.now());assert.equal(display.read(10000),beforeFailure,'A fresh Replay sample freezes immediately when the source fails');
    await new Promise(resolve=>setTimeout(resolve,3050));liveTime=144;await adapters.poll();
    assert.equal(state.gameClock?.source,'live');assert.equal(state.gameClock?.gameTime,144);assert.equal(state.gameClock?.paused,true,'Old 8x playback cannot drive fresh Live samples');assert.equal(state.gameClock?.awaitingLiveSample,true,'Fallback preserves the seek recording barrier until the actual Live position is confirmed');assert.equal(displayClockInput(state).connected,true);
    replayAvailable=true;playback={time:144,speed:2,paused:false};await adapters.connect('replay');assert.equal(state.gameClock?.source,'replay');assert.equal(state.gameClock?.speed,2);assert.equal(state.gameClock?.paused,false);
    const readClock=()=>state.gameClock;delete state.gameClock;liveTime=0;await adapters.connect('live');const newClock=readClock();assert.equal(newClock?.source,'live');assert.equal(newClock?.gameTime,0);assert.equal(newClock?.paused,false);assert.notEqual(newClock?.sessionId,sessionId,'A cleared runtime does not reuse old playback metadata');
  }finally{await adapters.close();}
});
