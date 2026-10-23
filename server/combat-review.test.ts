import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombatReview } from './combat-review';
import { ReplayDamageIndex, type DamageEvent } from './replay-damage';
import { ReplayDirector, detectTeamfights } from './replay-director';
import { createFixture } from './test-support/fixture';
import { applyAction } from './state';
import { currentCombatReview } from '../shared/combat-review';
import { captureProgram, programState } from '../shared/production';
const heroes=Array.from({length:10},(_,i)=>({networkId:i+1,champion:`Hero${i+1}`,team:i<5?'blue' as const:'red' as const,officialTotal:0}));
const hit=(time:number,source:number,target:number,amount=100,type:0|1|2=0):DamageEvent=>({time,source,target,amount,type});
const events=[hit(100,1,6),hit(101,2,6,200,1),hit(102,7,2),hit(103,3,7),hit(104,1,6,300,2),hit(105,99,6,50),hit(105,1,500,500),hit(106,2,500,250),hit(190,1,6,9000)];
const index=new ReplayDamageIndex(heroes,200,events),moments=[...detectTeamfights(index),{id:'death',kind:'kill' as const,title:'death',time:106,start:97,end:106,basis:'damage' as const,participants:['Hero1','Hero6'],victim:'Hero6'}];
function build(from=0,until=110,time=110){return buildCombatReview(index,{session:'session-1',time,from,until,players:[],moments,units:new Map([[500,'barons']]),now:1000});}
test('flow bounds its window and played time; sums known enemy damage by pair and type',()=>{
 const v=build();assert.equal(v.flows.find(f=>f.source.id===1&&f.target.id===6)?.total,400);assert.equal(v.flows.find(f=>f.source.id===1)?.trueDamage,300);assert.ok(v.flows.every(f=>f.source.id!==99&&f.target.id!==500));assert.equal(v.flowComplete,true);assert.ok(v.flows.every(f=>f.total<9000));
});
test('death recap preserves unknown sources and excludes future hits and prior deaths',()=>{
 const v=build();assert.equal(v.deaths[0].sources.reduce((sum,r)=>sum+r.total,0),650);assert.equal(v.deaths[0].sources.find(r=>r.source.id===99)?.source.name,'单位 #99');
 const twice=buildCombatReview(index,{session:'s',time:110,from:0,until:110,players:[],moments:[{...moments.at(-1)!,id:'prior',time:102},moments.at(-1)!],units:new Map(),now:1000});assert.equal(twice.deaths[1].sources.reduce((sum,r)=>sum+r.total,0),350);
});
test('incomplete coverage remains explicit and cannot produce target DPS or complete fight totals',()=>{
 const v=build(106,110);assert.equal(v.flowComplete,false);assert.equal(v.deaths[0].complete,false);assert.equal(v.fights[0].complete,false);assert.ok(v.fights[0].rows.every(r=>r.damage===null));assert.equal(v.objectives[0].dps,null);
});
test('objective DPS uses known target identity and an exact five-second window',()=>{
 const v=build();assert.equal(v.objectives.length,1);assert.equal(v.objectives[0].total,750);assert.equal(v.objectives[0].dps,150);assert.equal(v.objectives[0].rows[0].dps,100);
 assert.equal(buildCombatReview(index,{session:'s',time:110,from:0,until:110,players:[],moments,units:new Map()}).objectives.length,0);
});
test('fight library tracks while normal gameplay is on air and excludes future fights',()=>{
 const v=build();assert.equal(v.fights.length,1);assert.equal(v.fights[0].rows.find(r=>r.player.id===1)?.damage,400);assert.equal(v.fights[0].samples.at(-1)?.blue,700);assert.equal(v.fights[0].samples.at(-1)?.red,100);
 const s=createFixture();s.phase='live';s.programScene='live';s.combatReview=v;s.gameTime=110;s.connections.live.status='connected';assert.equal(currentCombatReview(s,2000)?.fights.length,1);s.gameTime=95;assert.equal(currentCombatReview(s,2000),undefined);s.gameTime=110;s.connections.live.status='disconnected';assert.equal(currentCombatReview(s,2000),undefined);
});
test('history selection validates IDs and stays pending until TAKE',()=>{
 let s=createFixture();s.combatReview=build();const id=s.combatReview.fights[0].id;
 assert.throws(()=>applyAction(s,{type:'set-overlay',patch:{combatMomentId:'missing'}}),/已失效/);
 s=applyAction(s,{type:'set-overlay',patch:{combatReviewMode:'fight-history',combatMomentId:id}});assert.equal(programState(s).overlay.combatReviewMode,undefined);s=applyAction(s,{type:'take',scene:'live'});assert.equal(programState(s).overlay.combatMomentId,id);
});
test('simultaneous disjoint skirmish damage stays outside the selected fight',()=>{
 const sample=new ReplayDamageIndex(heroes,200,[hit(100,1,6),hit(101,2,6),hit(102,7,2),hit(103,3,7),hit(103,4,8,999),hit(104,1,6)]);
 const v=buildCombatReview(sample,{session:'s',time:110,from:0,until:110,players:[],moments:detectTeamfights(sample),units:new Map()});
 assert.equal(v.fights.length,1);assert.equal(v.fights[0].rows.find(r=>r.player.id===4)?.damage,0);assert.equal(v.fights[0].samples.at(-1)?.blue,400);
});
test('network identities keep mirrored champions outside unrelated fights and resolve the death victim',()=>{
 const mirrored=heroes.map(h=>h.networkId===8?{...h,champion:'Hero1'}:h),sample=new ReplayDamageIndex(mirrored,200,[hit(100,1,6),hit(101,2,6),hit(102,7,2),hit(103,3,7),hit(103,4,8,999),hit(104,1,6)]),fights=detectTeamfights(sample);
 const options={session:'s',time:110,from:0,until:110,players:[],moments:[...fights,{id:'mirror-death',kind:'kill' as const,title:'death',time:104,start:100,end:104,basis:'damage' as const,participants:['Hero4','Hero1'],victim:'Hero1',victimId:8}],units:new Map<number,string>()};
 const v=buildCombatReview(sample,options);assert.equal(v.fights[0].rows.find(r=>r.player.id===4)?.damage,0);assert.equal(v.deaths[0].victim.id,8);assert.equal(v.deaths[0].sources[0].total,999);
 const ambiguous=buildCombatReview(sample,{...options,moments:fights.map(f=>({...f,participantIds:undefined}))});assert.equal(ambiguous.fights[0].complete,false);assert.ok(ambiguous.fights[0].rows.every(r=>r.damage===null));
});
test('director exposes analysis from its current process only and never shows future death recaps',()=>{
 const director=new ReplayDirector(),sample={pid:10,processSession:'one',replayPath:'x.rofl',gameTime:110,players:heroes};
 const data={allPlayers:heroes.map(h=>({summonerName:h.champion,rawChampionName:`game_character_displayname_${h.champion}`,team:h.team==='blue'?'ORDER':'CHAOS'})),events:{Events:[{EventID:1,EventName:'ChampionKill',EventTime:106,KillerName:'Hero1',VictimName:'Hero6'},{EventID:2,EventName:'ChampionKill',EventTime:190,KillerName:'Hero1',VictimName:'Hero6'}]}};
 director.observe(data,sample,index,undefined,1000);assert.equal(director.combatReview([],110,2000)?.deaths.length,1);assert.equal(director.combatReview([],150,2000),undefined);assert.equal(director.combatReview([],110,8000),undefined);director.reset();assert.equal(director.combatReview([],110,2000),undefined);
});

test('live combat values use on-air roster names until TAKE across every embedded combatant',()=>{
 let s=createFixture();s.phase='live';s.gameTime=110;s.players=s.players.map((p,i)=>({...p,id:`live-${i+1}`,team:heroes[i].team,championId:heroes[i].champion,name:`On air ${i+1}`}));
 s.production!.program=captureProgram(s);
 s.players=s.players.map((p,i)=>({...p,name:`Pending ${i+1}`}));
 s.combatReview=buildCombatReview(index,{session:'s',time:110,from:0,until:110,players:s.players,moments,units:new Map([[500,'barons']])});
 const staged=s.combatReview,view=programState(s).combatReview!;
 assert.equal(view.flows.find(f=>f.source.id===1)?.source.name,'On air 1');assert.equal(view.flows.find(f=>f.target.id===6)?.target.name,'On air 6');
 assert.equal(view.deaths[0].victim.name,'On air 6');assert.equal(view.deaths[0].sources.find(r=>r.source.id===1)?.source.name,'On air 1');
 assert.equal(view.fights[0].rows.find(r=>r.player.id===1)?.player.name,'On air 1');assert.equal(view.objectives[0].rows.find(r=>r.player.id===1)?.player.name,'On air 1');
 assert.equal(view.flows.find(f=>f.source.id===1)?.total,400);assert.equal(staged.flows.find(f=>f.source.id===1)?.source.name,'Pending 1');
 s=applyAction(s,{type:'take',scene:'live'});assert.equal(programState(s).combatReview!.flows.find(f=>f.source.id===1)?.source.name,'Pending 1');
});
