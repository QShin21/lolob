import {test} from 'node:test';import assert from 'node:assert/strict';
import {ReplayDirector,damageStart,detectTeamfights} from './replay-director';
import {ReplayDamageIndex,type DamageEvent,type DamageHero} from './replay-damage';
import {Adapters,ChampionCatalog} from './adapters';import {createFixture} from './test-support/fixture';
import {finalizeGame} from './game-results';import {programState,productionKey} from '../shared/production';import {normalizeSavedState} from './state';
const heroes:DamageHero[]=Array.from({length:10},(_,i)=>({networkId:i+1,champion:`Hero${i+1}`,team:i<5?'blue':'red',officialTotal:0}));
const damage=(time:number,source:number,target:number):DamageEvent=>({time,source,target,amount:50,type:0});
function inputs(time=100){return {sample:{ok:true,pid:10,processSession:'first',replayPath:'C:/a.rofl',gameTime:time,players:heroes.map(h=>({...h})),objectiveCounts:{blue:{dragons:0},red:{dragons:0}}},data:{allPlayers:heroes.map(h=>({rawChampionName:`game_character_displayname_${h.champion}`,team:h.team==='blue'?'ORDER':'CHAOS',summonerName:h.champion})),events:{Events:[{EventID:1,EventName:'ChampionKill',EventTime:102,KillerName:'Hero1',VictimName:'Hero6'},{EventID:2,EventName:'DragonKill',EventTime:150,KillerName:'Hero2',DragonType:'Elder'}]}}};}
test('kill starts at continuous victim damage, preserves pre-roll, and respects previous death',()=>{
 const events=[damage(20,1,6),damage(70,1,6),damage(95,1,6),damage(98,2,6),damage(101,1,6)];
 assert.equal(damageStart(events,6,102),95);assert.equal(damageStart(events,6,102,96),98);assert.equal(damageStart(events,6,110),undefined);
 const d=new ReplayDirector(),{data,sample}=inputs();d.observe(data,sample,new ReplayDamageIndex(heroes,200,events));
 const v=d.snapshot();assert.equal(v.moments.find(e=>e.kind==='kill')?.start,92);assert.equal(v.moments.find(e=>e.kind==='objective')?.title,'Hero2 击杀远古龙');assert.equal(v.moments.find(e=>e.kind==='objective')?.basis,'event');
});
test('teamfights require connected five-player involvement with both sides; disjoint lanes stay separate',()=>{
 const index=new ReplayDamageIndex(heroes,300,[damage(10,1,6),damage(11,2,7),damage(12,3,8),damage(13,4,9),damage(100,1,6),damage(101,2,6),damage(102,7,2),damage(104,3,7),damage(105,1,6),damage(150,1,6)]);
 const fights=detectTeamfights(index);assert.equal(fights.length,1);assert.equal(fights[0].start,95);assert.equal(fights[0].time,100);assert.equal(fights[0].end,105);assert.equal(fights[0].participants.length,5);assert.equal(detectTeamfights(index,102).length,0);
});
test('resource counters only create events during continuous coverage; seeks and new sessions never fabricate kills',()=>{
 const d=new ReplayDirector(),{data,sample}=inputs(100);data.events.Events=[];Object.assign(sample,{neutralUnits:[{id:99,kind:'dragons'}]});
 const index=new ReplayDamageIndex(heroes,200,[damage(95,1,99),damage(99,1,99),damage(101,1,99)]);
 d.observe(data,sample,index,undefined,1000);sample.gameTime=101.1;sample.objectiveCounts.blue.dragons=1;d.observe(data,sample,index,undefined,1500);
 assert.equal(d.snapshot(1500).moments.length,1);assert.equal(d.snapshot(1500).moments[0].start,92);assert.equal(d.snapshot(1500).moments[0].basis,'damage');
 sample.gameTime=180;sample.objectiveCounts.blue.dragons=2;d.observe(data,sample,index,undefined,2000);assert.equal(d.snapshot(2000).moments.length,1);
 sample.gameTime=0;sample.objectiveCounts.blue.dragons=0;d.observe(data,sample,index,undefined,2500);assert.equal(d.snapshot(2500).moments.length,1);
 const session=d.snapshot(2500).session;sample.processSession='second';d.observe(data,sample,index,undefined,3000);assert.notEqual(d.snapshot(3000).session,session);assert.equal(d.snapshot(3000).moments.length,0);assert.equal(d.snapshot(10000).connected,false);
});
test('observer list clips future events and reports damage coverage; missing damage is explicitly estimated',()=>{
 const d=new ReplayDirector(),{data,sample}=inputs(100);delete (sample as any).replayPath;d.observe(data,sample,undefined,{from:80,until:100});assert.equal(d.snapshot().moments.length,0);
 sample.gameTime=105;d.observe(data,sample,undefined,{from:80,until:105});assert.equal(d.snapshot().moments.length,1);assert.equal(d.snapshot().moments[0].start,99);assert.equal(d.snapshot().moments[0].basis,'event');
});

test('simultaneous different resources survive deduplication and matching API events gain damage onset',()=>{
 const d=new ReplayDirector(),{data,sample}=inputs(100);
 data.events.Events=[{EventID:5,EventName:'BaronKill',EventTime:101,KillerName:'Hero2',DragonType:''}];
 Object.assign(sample,{neutralUnits:[{id:99,kind:'dragons'}],objectiveCounts:{blue:{dragons:0},red:{dragons:0}}});
 const index=new ReplayDamageIndex(heroes,200,[damage(95,1,99),damage(99,1,99),damage(101,1,99)]);
 d.observe(data,sample,index,undefined,1000);sample.gameTime=101.1;sample.objectiveCounts.blue.dragons=1;
 d.observe(data,sample,index,undefined,1500);assert.equal(d.snapshot(1500).moments.length,2);
 data.events.Events.push({EventID:6,EventName:'DragonKill',EventTime:101,KillerName:'Hero1',DragonType:'Fire'});
 d.observe(data,sample,index,undefined,1600);const events=d.snapshot(1600).moments;
 assert.equal(events.length,2);assert.equal(events.find(e=>e.objective==='dragons')?.start,92);assert.equal(events.find(e=>e.objective==='dragons')?.basis,'damage');
});
test('review playback updates live program while archived reports and restart remain frozen',()=>{
 const s=createFixture();s.programScene='live';finalizeGame(s,{source:'manual',winner:'blue'});const archived=structuredClone(s.gameResults);
 const end=s.gameTime;s.replayReview={session:'current',key:productionKey(s)};s.gameTime=50;s.players[0].kills=0;
 assert.equal(programState(s).gameTime,50);s.programScene='postgame';assert.equal(programState(s).gameTime,end);assert.deepEqual(s.gameResults,archived);
 assert.equal(normalizeSavedState(s).replayReview,undefined);
});
test('explicit director seek works on air, bounds time, rejects old sessions and serializes commands',async()=>{
 const state=createFixture();state.programScene='live';
 let posted:any[]=[];let processID=10;let release:(()=>void)|undefined;let blocked=false;
 const adapters=new Adapters(()=>state,f=>f(state),new ChampionCatalog('.'),async(_port,route,options)=>{
  if(route==='/replay/game')return {processID};
  if(options?.method==='POST'){posted.push(options.body);if(blocked)await new Promise<void>(r=>{release=r;});return {time:92,paused:false,speed:1,length:200};}
  return {time:100,paused:false,speed:1,length:200};
 });
 try{
  const director=(adapters as any).observer.director as ReplayDirector,{data,sample}=inputs();director.observe(data,sample,new ReplayDamageIndex(heroes,200,[damage(95,1,6),damage(101,1,6)]));
  await assert.rejects(adapters.replay({time:90}),/正在播出/);
  const v=director.snapshot();await adapters.controlReplayDirector({session:v.session,eventId:v.moments[0].id});assert.deepEqual(posted[0],{time:92,paused:false,speed:1});
  await assert.rejects(adapters.controlReplayDirector({session:'stale',time:10}),/连接已变化/);await assert.rejects(adapters.controlReplayDirector({session:v.session,time:201}),/范围/);
  processID=11;await assert.rejects(adapters.controlReplayDirector({session:v.session,time:10}),/进程已变化/);processID=10;
  blocked=true;const p=adapters.controlReplayDirector({session:v.session,paused:true});while(!release)await new Promise(r=>setImmediate(r));await assert.rejects(adapters.controlReplayDirector({session:v.session,time:20}),/上一次/);release();await p;
  assert.equal(posted.length,2);
 }finally{await adapters.close();}
});
