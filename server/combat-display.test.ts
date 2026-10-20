import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixture} from './test-support/fixture';
import {syncFightSegment} from '../shared/combat-display';
import {neutralObjectives,ObjectiveEventContinuity} from './neutral-objectives';
import {applyAction} from './state';
import {programState} from '../shared/production';
const now=Date.parse('2026-10-20T04:00:00Z');
function fight(){const s=createFixture();s.phase='live';s.programScene='teamfight';s.gameTime=1200;s.connections.live.status='connected';delete s.production?.program;s.players.forEach((p,i)=>{p.telemetry={source:'api',sampledAt:new Date(now).toISOString(),gameTime:1200,validForMs:5000};p.telemetryDamageSource='api';p.telemetryDamage={toChampions:1000+i*100};});return s;}
test('fight entry establishes one baseline; poll and browser reconnect retain it; reentry resets',()=>{
 const s=fight();syncFightSegment(s,now);const id=s.fightSegment!.id;assert.equal(s.fightSegment!.players[s.players[0].id].total,0);
 s.players[0].telemetryDamage!.toChampions!+=350;s.gameTime+=1;syncFightSegment(s,now+1000);assert.equal(s.fightSegment!.players[s.players[0].id].total,350);assert.equal(s.fightSegment!.id,id);
 const restored=structuredClone(s);syncFightSegment(restored,now+1000);assert.deepEqual(restored.fightSegment,s.fightSegment);
 s.programScene='live';syncFightSegment(s,now+1000);assert.equal(s.fightSegment!.active,false);s.programScene='teamfight';syncFightSegment(s,now+2000);assert.equal(s.fightSegment!.players[s.players[0].id].total,0);assert.notEqual(s.fightSegment!.id,id);
});
test('preview does not start damage; missing baseline, postgame totals and stale samples cannot become damage',()=>{
 const s=fight();s.programScene='live';s.previewScene='teamfight';syncFightSegment(s,now);assert.equal(s.fightSegment,undefined);
 s.programScene='teamfight';s.players[0].telemetryDamageSource='postgame';delete s.players[1].telemetryDamage;syncFightSegment(s,now);
 assert.equal(s.fightSegment!.players[s.players[0].id].total,undefined);assert.equal(s.fightSegment!.players[s.players[1].id].total,undefined);
 syncFightSegment(s,now+10000);assert.equal(s.fightSegment!.players[s.players[2].id].total,undefined);
});
test('seek, decreasing counters, replacement champions invalidate a segment until next entry',()=>{
 for(const scenario of ['seek','counter','champion']){const s=fight();syncFightSegment(s,now);const p=s.players[0];p.telemetryDamage!.toChampions=1400;syncFightSegment(s,now+1000);
 if(scenario==='seek')s.gameTime=1100;if(scenario==='counter')p.telemetryDamage!.toChampions=1200;if(scenario==='champion')p.championId='Gwen';syncFightSegment(s,now+1500);assert.equal(s.fightSegment!.players[p.id].invalid,true);assert.equal(s.fightSegment!.players[p.id].total,undefined);}
});
test('packet stream capture epochs and incomplete origins invalidate the active fight',()=>{
 for(const reason of ['epoch','origin']){
  const s=fight(),p=s.players[0];p.telemetryDamageSource='packets';p.telemetryDamageSession='capture:1';p.telemetryDamageSince=1100;
  syncFightSegment(s,now);p.telemetryDamage!.toChampions=1500;
  if(reason==='epoch')p.telemetryDamageSession='capture:2';else p.telemetryDamageSince=1201;
  syncFightSegment(s,now+1000);assert.equal(s.fightSegment!.players[p.id].invalid,true);assert.equal(s.fightSegment!.players[p.id].total,undefined);
 }
});
function data(time:number,events:any[]=[]){return {gameData:{gameTime:time,mapNumber:11,gameMode:'CLASSIC',gameVersion:'16.20.1'},_eventHistoryComplete:true,allPlayers:[{summonerName:'Blue',team:'ORDER'}],events:{Events:[{EventName:'GameStart',EventTime:0},...events]}};}
test('neutral phases and initial countdowns use a common game-time clock',()=>{
 assert.deepEqual(neutralObjectives(data(100),now)?.objectives.map(o=>[o.kind,o.dueAt]),[['grubs',480],['dragon',300]]);
 assert.equal(neutralObjectives(data(500),now)?.objectives[0].state,'alive');
 assert.deepEqual(neutralObjectives(data(890),now)?.objectives[0],{kind:'herald',element:undefined,state:'countdown',dueAt:900});
 assert.equal(neutralObjectives(data(1201),now)?.objectives[0].kind,'baron');
 const killed=neutralObjectives(data(1300,[{EventName:'BaronKill',EventTime:1250}]),now)!;assert.equal(killed.objectives[0].dueAt,1610);
});
test('soul changes drake to elder; repeated event reconstruction is stable; rewind discards future events',()=>{
 const events=[400,800,1200,1600].map(EventTime=>({EventName:'DragonKill',EventTime,DragonType:'Water',KillerName:'Blue'}));
 const s=data(1650,events);assert.equal(neutralObjectives(s,now)?.objectives[1].kind,'elder');assert.equal(neutralObjectives(s,now)?.objectives[1].dueAt,1960);
 assert.equal(neutralObjectives(data(1300,events),now)?.objectives[1].kind,'dragon');assert.equal(neutralObjectives(data(1300,events),now)?.objectives[1].element,'water');
 assert.deepEqual(neutralObjectives(s,now),neutralObjectives(s,now));
});
test('partial event history stays unknown; direct observer timers survive missing kill events; wrong map and stale samples rejected',()=>{
 const s:any=data(1800);s._eventHistoryComplete=false;assert.equal(neutralObjectives(s,now)?.objectives[0].state,'unknown');
 s._observerObjectives={profile:'cn-16.20.824.8524',gameTime:1800,sampledAt:new Date(now).toISOString(),validForMs:3000,objectives:[{kind:'baron',state:'alive'},{kind:'dragon',element:'water',state:'countdown',dueAt:1900}]};
 assert.equal(neutralObjectives(s,now)?.objectives[0].state,'alive');assert.equal(neutralObjectives(s,now)?.objectives[1].dueAt,1900);
 assert.equal(neutralObjectives(s,now+10000)?.objectives[0].state,'unknown');s.gameData.mapNumber=12;assert.equal(neutralObjectives(s,now),undefined);
});
test('event continuity rejects jump-ahead logs that still include GameStart',()=>{
 const c=new ObjectiveEventContinuity(),a:any=data(5);c.observe(a,now);assert.equal(a._eventHistoryComplete,true);a.gameData.gameTime=1200;c.observe(a,now+1000);assert.equal(a._eventHistoryComplete,false);
});
test('new damage report is prepared off-air and published only on TAKE',()=>{
 let s=fight();s=applyAction(s,{type:'take',scene:'postgame'});s=applyAction(s,{type:'set-overlay',patch:{postgamePage:3}});assert.notEqual(programState(s).overlay.postgamePage,3);s=applyAction(s,{type:'take',scene:'postgame'});assert.equal(programState(s).overlay.postgamePage,3);
});
