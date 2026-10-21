import test from 'node:test';
import assert from 'node:assert/strict';
import {coherentPlayback,ReplaySampleHistory,recoverFightBaseline} from './replay-sampling';
import {ReplayDamageIndex} from './replay-damage';
import {Adapters,ChampionCatalog} from './adapters';
import {createFixture} from './test-support/fixture';
import {syncFightSegment} from '../shared/combat-display';
import {finalizeGame,reconcileArchivedFrame} from './game-results';
import {productionKey,programState,captureProgram} from '../shared/production';
import {EconomyBridge} from './economy';

test('playback bracket rejects seeks, stale data and speed/pause changes; accepts 8x and paused frames',()=>{
  const a={at:1000,value:{time:100,speed:8,paused:false}};
  const b={at:1500,value:{time:104,speed:8,paused:false}};
  assert(coherentPlayback(a,b,102));assert(!coherentPlayback(a,b,90));assert(!coherentPlayback(a,b,110));
  for(const patch of [{time:20},{time:600},{seeking:true},{paused:true},{speed:1}])assert(!coherentPlayback(a,{...b,value:{...b.value,...patch}},102));
  assert(coherentPlayback({...a,value:{...a.value,paused:true}},{...b,value:{...a.value,paused:true}},100));
});

test('half-second history preserves all player metrics, hides future curve points and isolates source sessions',()=>{
  const s=createFixture(),history=new ReplaySampleHistory(3);
  const frame=(time:number)=>({gameTime:time,players:s.players,stats:{...s.stats,blue:{...s.stats.blue,gold:time*10},red:{...s.stats.red,gold:time*8}},neutralObjectives:s.neutralObjectives});
  history.record('one',frame(100));history.record('one',frame(200));history.record('one',frame(50));
  assert.deepEqual(history.economy(100).map(p=>p.time),[50,100]);
  assert.deepEqual(history.economy(200).map(p=>p.time),[50,100,200]);
  const stored=history.at(100)!;stored.players[0].cs=9999;assert.notEqual(history.at(100)!.players[0].cs,9999);
  history.record('one',frame(100.4));assert.equal(history.at(100.2),undefined,'A future sample in the same bucket is never served as past data');
  history.record('one',frame(300));assert.equal(history.at(100.4),undefined,'Storage stays bounded');
  history.record('two',frame(5));assert.deepEqual(history.economy(1000).map(p=>p.time),[5]);
});

function harness(){
  const state=createFixture();state.programScene='standby';state.gameTime=0;state.players=[];delete state.gameClock;
  let playback={time:100,speed:1,paused:true,seeking:false},reading=100;
  let block:Promise<void>|undefined;let entered:(()=>void)|undefined;
  const data=(time:number)=>({allPlayers:[{riotId:'Test#One',championName:'Ahri',team:'ORDER',level:1,totalGold:time*10,scores:{kills:Math.floor(time/100),deaths:0,assists:0,creepScore:Math.floor(time/10)}}],gameData:{gameTime:time},events:{Events:[]}});
  const adapters=new Adapters(()=>state,f=>f(state),new ChampionCatalog('.'),async(_port,route,options)=>{
    if(route==='/replay/playback'){if(options?.method==='POST')playback={...playback,...options.body as typeof playback};return {...playback};}
    if(route==='/liveclientdata/allgamedata'){const result=data(reading);if(block){entered?.();await block;block=undefined;}return result;}
    throw Error(route);
  });
  return {state,adapters,position:(time:number)=>{playback.time=time;reading=time;},read:(time:number)=>{reading=time;},
    hold:()=>{let release!:()=>void;block=new Promise<void>(r=>{release=r;});const started=new Promise<void>(r=>{entered=r;});return {started,release};}};
}
test('in-flight old sample cannot overwrite a completed seek; stale landing samples cannot commit',async()=>{
  const h=harness();try{
    await h.adapters.connect('live');assert.equal(h.state.gameTime,100);
    const pending=h.hold(),poll=h.adapters.poll();await pending.started;
    await h.adapters.replay({time:600,paused:true},true);pending.release();await poll;
    assert.equal(h.state.gameTime,100);assert.equal(h.state.players[0].cs,10);
    await h.adapters.poll();assert.equal(h.state.gameTime,100);assert.equal(h.state.gameClock?.awaitingLiveSample,true);
    h.read(600);await h.adapters.poll();assert.equal(h.state.gameTime,600);assert.equal(h.state.players[0].cs,60);assert(!h.state.gameClock?.awaitingLiveSample);
    h.position(200);await h.adapters.poll();assert.equal(h.state.gameTime,200,'External game seek uses the new coherent frame');assert.equal(h.state.players[0].cs,20);
  }finally{await h.adapters.close();}
});
test('control during native enrichment discards the complete old metrics transaction',async()=>{
  const h=harness();try{
    await h.adapters.connect('live');let release!:()=>void,entered!:()=>void;
    const blocked=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
    (h.adapters as any).observer.enrich=async()=>{entered();await blocked;};
    const poll=h.adapters.poll();await started;await h.adapters.replay({time:300},true);release();await poll;
    assert.equal(h.state.gameTime,100);assert.equal(h.state.gameClock?.awaitingLiveSample,true);
  }finally{await h.adapters.close();}
});
test('a newer connection sample wins over an earlier in-flight poll, and changing matches rejects pending data',async()=>{
  const h=harness();try{
    await h.adapters.connect('live');const pending=h.hold(),older=h.adapters.poll();await pending.started;
    h.position(200);const newer=h.adapters.connect('live');await new Promise(r=>setImmediate(r));pending.release();await Promise.all([older,newer]);
    assert.equal(h.state.gameTime,200);assert.equal(h.state.players[0].cs,20);
    const hold=h.hold(),poll=h.adapters.poll();await hold.started;h.state.match.game++;hold.release();await poll;
    assert.equal(h.state.gameTime,200);
  }finally{await h.adapters.close();}
});
test('direct economy housekeeping never replays an older feed over a new frame or truncates history',()=>{
  const s=createFixture(),bridge=new EconomyBridge(()=>s,f=>f(s),{goldSource:'direct'});
  const curve=structuredClone(s.economy);bridge.reset(false);assert.deepEqual(s.economy,curve);
  bridge.close();
});
test('fight waits through seek, establishes a new coherent baseline, then resumes totals',()=>{
  const s=createFixture();s.programScene='teamfight';s.phase='live';delete s.production?.program;s.connections.live.status='connected';
  const now=Date.now();const frame=(time:number,damage:number)=>{s.gameTime=time;s.players.forEach(p=>{p.telemetry={source:'memory',sampledAt:new Date(now).toISOString(),gameTime:time,validForMs:3000};p.telemetryDamage={toChampions:damage};p.telemetryDamageSource='packets';p.telemetryDamageSession='same';});};
  frame(600,2000);syncFightSegment(s,now);s.gameClock={source:'replay',gameTime:100,speed:1,paused:true,sampledAt:new Date(now).toISOString(),sessionId:'one',discontinuity:1,matchKey:'one',validForMs:3000,awaitingLiveSample:true};
  syncFightSegment(s,now);assert.equal(s.fightSegment!.players[s.players[0].id].total,undefined);
  frame(100,200);delete s.gameClock.awaitingLiveSample;syncFightSegment(s,now);assert.equal(s.fightSegment!.startedAt,100);assert.equal(s.fightSegment!.players[s.players[0].id].total,0);
  frame(105,375);syncFightSegment(s,now);assert.equal(s.fightSegment!.players[s.players[0].id].total,175);
});

 test('late packet availability restores entry baseline from historical damage rather than current cumulative damage',()=>{
  const s=createFixture();s.programScene='teamfight';s.phase='live';delete s.production?.program;s.connections.live.status='connected';s.gameTime=100;
  for(const p of s.players){delete p.telemetryDamage;delete p.telemetryDamageSession;}
  syncFightSegment(s);const p=s.players[0],enemy=s.players[5];
  const index=new ReplayDamageIndex([{networkId:1,champion:p.championId,team:p.team,officialTotal:100},{networkId:2,champion:enemy.championId,team:enemy.team,officialTotal:0}],200,[{time:90,source:1,target:2,amount:40,type:0},{time:103,source:1,target:2,amount:60,type:0}]);
  s.gameTime=105;p.telemetryDamageSource='packets';p.telemetryDamageSession='replay:one';p.telemetryDamage={toChampions:100};p.telemetry={source:'memory',gameTime:105,sampledAt:new Date().toISOString(),validForMs:3000};
  recoverFightBaseline(s,index);syncFightSegment(s);assert.equal(s.fightSegment!.players[p.id].baseline,40);assert.equal(s.fightSegment!.players[p.id].total,60);
 });

 test('service commit preserves reviewed live metrics after match end while archived reports remain frozen',()=>{
  const s=createFixture();s.programScene='live';s.phase='live';captureProgram(s);
  const result=finalizeGame(s,{source:'manual',winner:'blue'})!,original=structuredClone(result.snapshot);
  s.replayReview={session:'replay:one',key:productionKey(s)};s.gameTime=100;s.players=structuredClone(s.players);s.players[0].cs=12;s.players[0].gold=900;s.phase='live';
  reconcileArchivedFrame(s);assert.equal(s.gameTime,100);assert.equal(s.players[0].cs,12);assert.equal(programState(s).players[0].gold,900);assert.deepEqual(result.snapshot,original);
  s.programScene='postgame';assert.equal(programState(s).gameTime,original.duration);
  delete s.replayReview;reconcileArchivedFrame(s);assert.equal(s.gameTime,original.duration);assert.equal(s.players[0].cs,original.players[0].cs);
  s.replayReview={session:'old',key:'old-match'};s.gameTime=90;reconcileArchivedFrame(s);assert.equal(s.gameTime,original.duration);
 });
