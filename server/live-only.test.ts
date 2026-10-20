import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, applyAction, normalizeSavedState, resetRuntimeState } from './state';
import { createFixture } from './test-support/fixture';
import { finalizeGame } from './game-results';
import { clientPollScheduler } from './client-poll';
import { normalizeClientPollInterval } from '../shared/client-poll';

test('first launch waits for client samples and rejects every removed demonstration action',()=>{
  const s=createSeed();
  assert.equal(s.mode,'live');assert.equal(s.phase,'pregame');assert.equal(s.programScene,'standby');
  for(const key of ['players','schedule','events','economy','draftHistory','recordings'] as const)assert.deepEqual(s[key],[]);
  assert.equal(s.gameTime,0);assert.equal(s.stats.blue.gold,null);assert.equal(s.stats.red.gold,null);
  assert.ok(s.teams.every(t=>t.players.length===0));assert.equal(s.match.title,'');
  for(const action of [{type:'set-mode',mode:'demo'},{type:'demo-pause',paused:false},{type:'demo-reset'},{type:'save-recording'},{type:'finalize-game',winner:'blue'}])assert.throws(()=>applyAction(s,action));
  resetRuntimeState(s);assert.deepEqual(s.players,[]);assert.equal(s.gameTime,0);
});

test('upgrade clears legacy demonstration buses and archives while preserving real records and custom data',()=>{
  const live=createFixture();finalizeGame(live,{source:'live',winner:'blue',terminal:true});
  const legacy=createFixture();
  Object.assign(legacy,{mode:'demo'});legacy.match.seriesId='demo-seed-series';
  Object.assign(legacy.production!.program!,{mode:'demo'});
  legacy.production!.previousProgram={content:structuredClone(legacy.production!.program!),scene:'live'};
  legacy.production!.programRosterHold=structuredClone(legacy.players);legacy.production!.programDraftHold=structuredClone(legacy.draft);
  const demo=structuredClone(live.gameResults![0]);Object.assign(demo.snapshot,{mode:'demo'});demo.id='legacy-demo-result';
  legacy.gameResults=[demo,...live.gameResults!];legacy.recordings=[demo.snapshot,...live.recordings];
  legacy.draftHistory!.forEach(h=>Object.assign(h,{source:'demo',seriesId:'demo-seed-series'}));
  legacy.teams[0].name='用户赛事战队';legacy.overlay.tickerText='用户字幕';legacy.settings.lockfilePath='C:/client/lockfile';
  legacy.assets=[{id:'logo',name:'Logo',url:'/uploads/logo.png',type:'image/png',createdAt:'2026-10-20T00:00:00Z'}];
  const before=structuredClone(legacy),migrated=normalizeSavedState(legacy);resetRuntimeState(migrated);
  assert.deepEqual(legacy,before,'migration never mutates its input');
  assert.equal(migrated.mode,'live');assert.equal(migrated.phase,'pregame');assert.equal(migrated.programScene,'standby');
  assert.deepEqual(migrated.players,[]);assert.deepEqual(migrated.events,[]);assert.deepEqual(migrated.economy,[]);assert.deepEqual(migrated.draftHistory,[]);
  assert.equal(migrated.production!.program?.mode,'live');assert.deepEqual(migrated.production!.program?.telemetry.players,[]);assert.equal(migrated.production!.previousProgram,undefined);assert.equal(migrated.production!.programRosterHold,undefined);
  assert.deepEqual(migrated.gameResults,live.gameResults);assert.deepEqual(migrated.recordings,live.recordings);
  assert.equal(migrated.teams[0].name,'用户赛事战队');assert.equal(migrated.overlay.tickerText,'用户字幕');
  assert.deepEqual(migrated.assets,legacy.assets);assert.equal(migrated.settings.lockfilePath,legacy.settings.lockfilePath);
  assert.deepEqual(normalizeSavedState(migrated),migrated,'migration is idempotent');
});

test('legacy default tournament is removed and live state cannot restore an old demonstration undo bus',()=>{
  const legacy=createFixture();Object.assign(legacy,{mode:'demo'});legacy.match.seriesId='demo-seed-series';
  const clean=normalizeSavedState(legacy);
  assert.deepEqual(clean.schedule,[]);assert.deepEqual(clean.teams.map(t=>t.id),['blue','red']);
  assert.equal(clean.match.game,1);assert.equal(clean.match.blueScore,0);assert.equal(clean.match.redScore,0);
  const live=createFixture();live.production!.previousProgram={content:structuredClone(legacy.production!.program!),scene:'live'};
  Object.assign(live.production!.previousProgram.content,{mode:'demo'});
  const migrated=normalizeSavedState(live);
  assert.equal(migrated.production!.previousProgram,undefined);assert.deepEqual(migrated.players,live.players);
});

test('client interval defaults to 500 ms, accepts both bounds, rejects invalid writes and clamps legacy values',()=>{
  assert.equal(createSeed().settings.pollInterval,500);
  for(const value of [100,500,1000])assert.equal(applyAction(createSeed(),{type:'set-settings',patch:{pollInterval:value}}).settings.pollInterval,value);
  for(const value of [99,1001,1500,2000,NaN,Infinity,'100'])assert.throws(()=>applyAction(createSeed(),{type:'set-settings',patch:{pollInterval:value}}));
  for(const [value,expected] of [[undefined,500],[50,100],[10000,1000],[1500,1000],[1000,1000],[500,500],[100,100],[NaN,500]]){
    assert.equal(normalizeClientPollInterval(value),expected);
    const saved=createSeed();Object.assign(saved.settings,{pollInterval:value});
    assert.equal(normalizeSavedState(saved).settings.pollInterval,expected);
  }
});

test('client scheduler dispatches at 100 ms and applies edits without waiting for the former deadline',()=>{
  let calls=0;const tick=clientPollScheduler(()=>calls++);
  tick(0,500);tick(499,500);assert.equal(calls,1);tick(500,500);assert.equal(calls,2);
  tick(599,100);assert.equal(calls,2);tick(600,100);tick(700,100);assert.equal(calls,4);
  tick(1699,1000);assert.equal(calls,4);tick(1700,1000);assert.equal(calls,5);
});
