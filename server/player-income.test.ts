import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createSeed, csvRecording, resetRuntimeState, snapshotRecording, tickDemo } from './state';
import { createDemoIncomeSnapshot, currentIncomeSnapshot, incomeCategories, incomeGameKey, mergeIncomeTelemetry, normalizeIncomeValues, updateIncomeSnapshots } from './player-income';
import type { BroadcastState } from '../shared/types';

function realGame(time: number): BroadcastState {
  const seed = createSeed();
  const state = applyAction(seed, { type: 'set-mode', mode: 'live' });
  state.players = seed.players.map(player => ({ ...player, id: `live-${player.id}`, income: undefined }));
  state.gameTime = time;
  state.phase = 'live';
  return state;
}

test('ten-minute crossing freezes every player, preserves missing sources and survives later play and replay seeks', () => {
  const state = realGame(599);
  updateIncomeSnapshots(state);
  assert.equal(currentIncomeSnapshot(state), undefined);
  const before = structuredClone(state);
  state.gameTime = 600.7;
  state.players[0].gold = null;
  updateIncomeSnapshots(state, before, '2026-10-04T00:00:00.000Z');
  const sample = structuredClone(currentIncomeSnapshot(state)!);
  assert.equal(sample.targetTime, 600);
  assert.equal(sample.capturedTime, 600.7);
  assert.equal(sample.status, 'partial');
  assert.equal(sample.players.length, 10);
  assert.equal(sample.players[0].totalGold, null);
  assert.equal(sample.players[0].kills, state.players[0].kills);
  assert.ok(sample.players.every(player => incomeCategories.every(key => player.values[key].value === null && player.values[key].source === 'unavailable')));
  state.players[0].gold = 12000;
  state.players[0].kills += 5;
  for (const time of [800, 500, 600, 1200]) { state.gameTime = time; updateIncomeSnapshots(state, before); }
  assert.deepEqual(currentIncomeSnapshot(state), sample);
});

test('late connection keeps ten-minute values unavailable, then a replay crossing can repair the missed card', () => {
  const state = realGame(680);
  updateIncomeSnapshots(state);
  const late = currentIncomeSnapshot(state)!;
  assert.equal(late.status, 'late');
  assert.equal(late.capturedTime, 680);
  assert.ok(late.players.every(player => player.totalGold === null && player.kills === null && player.cs === null));
  state.gameTime = 599;
  const before = structuredClone(state);
  state.gameTime = 601;
  updateIncomeSnapshots(state, before);
  assert.equal(currentIncomeSnapshot(state)!.status, 'partial');
  assert.equal(currentIncomeSnapshot(state)!.capturedTime, 601);
});

test('ten-minute cards exclude earlier OCR statistics and accept only on-time delayed fields without changing confirmed values',()=>{
  const state=realGame(600.7);
  Object.assign(state.players[0],{statsSource:'ocr',statsGameTime:590,goldSource:'ocr',goldGameTime:590,gold:4900,kills:3,cs:70,income:{kills:0}});
  Object.assign(state.players[1],{statsSource:'api',statsGameTime:600.7,goldSource:'api',goldGameTime:600.7,gold:5000,kills:2,cs:80});
  updateIncomeSnapshots(state);
  const initial=currentIncomeSnapshot(state)!;
  assert.equal(initial.players[0].totalGold,null);assert.equal(initial.players[0].kills,null);assert.equal(initial.players[0].cs,null);
  assert.equal(initial.players[0].values.kills.value,0);assert.equal(initial.players[1].totalGold,5000);
  const metadata={capturedTime:initial.capturedTime,createdAt:initial.createdAt};
  const classification=structuredClone(initial.players[0].values);
  state.gameTime=603;
  Object.assign(state.players[0],{statsGameTime:601.2,goldGameTime:601.2,gold:5200,kills:4,deaths:2,assists:5,cs:75,income:{kills:300}});
  Object.assign(state.players[1],{statsGameTime:603,goldGameTime:603,gold:5400,kills:9,cs:99});
  updateIncomeSnapshots(state);
  const filled=currentIncomeSnapshot(state)!;
  assert.equal(filled.players[0].totalGold,5200);assert.equal(filled.players[0].kills,4);assert.equal(filled.players[0].cs,75);
  assert.deepEqual(filled.players[0].values,classification);assert.equal(filled.players[1].totalGold,5000);assert.equal(filled.players[1].kills,2);assert.equal(filled.players[1].cs,80);
  assert.deepEqual({capturedTime:filled.capturedTime,createdAt:filled.createdAt},metadata);
  const frozen=structuredClone(filled);
  state.gameTime=604;Object.assign(state.players[0],{statsGameTime:604,goldGameTime:604,gold:9000,kills:9,cs:90});
  updateIncomeSnapshots(state);assert.deepEqual(currentIncomeSnapshot(state),frozen);
});

test('missing ten-minute fields cannot be filled from outside the window or by statistics marked unavailable',()=>{
  const state=realGame(600);
  Object.assign(state.players[0],{statsSource:'ocr',statsGameTime:599,goldSource:'ocr',goldGameTime:599});
  Object.assign(state.players[1],{statsAvailable:false,statsSource:'api',statsGameTime:600});
  updateIncomeSnapshots(state);
  assert.equal(currentIncomeSnapshot(state)!.players[0].totalGold,null);assert.equal(currentIncomeSnapshot(state)!.players[1].kills,null);
  state.gameTime=602;
  for(const sourceTime of [599,606,NaN]){
    state.players[0].statsGameTime=sourceTime;state.players[0].goldGameTime=sourceTime;
    updateIncomeSnapshots(state);assert.equal(currentIncomeSnapshot(state)!.players[0].totalGold,null);assert.equal(currentIncomeSnapshot(state)!.players[0].kills,null);
  }
  state.gameTime=606;state.players[0].statsGameTime=601;state.players[0].goldGameTime=601;
  updateIncomeSnapshots(state);assert.equal(currentIncomeSnapshot(state)!.players[0].totalGold,null);assert.equal(currentIncomeSnapshot(state)!.players[0].kills,null);
  state.gameTime=604;state.players[0].statsGameTime=604;state.players[0].goldGameTime=604;
  updateIncomeSnapshots(state);assert.equal(currentIncomeSnapshot(state)!.players[0].totalGold,state.players[0].gold);assert.equal(currentIncomeSnapshot(state)!.players[0].kills,state.players[0].kills);
});

test('explicit compatible telemetry amounts preserve real zeroes and reject negative, nonfinite, strings and total inconsistencies', () => {
  assert.deepEqual(normalizeIncomeValues({ kills: 0, minions: 1900, monsters: -1, towers: Infinity, passive: '1213', other: NaN, creepScore: 90 }), { kills: 0, minions: 1900 });
  assert.equal(normalizeIncomeValues({ kills: null }), undefined);
  assert.equal(normalizeIncomeValues([300, 1900]), undefined);
  const state = realGame(600);
  for (const player of state.players) { player.income = { kills: 0, minions: 1000, monsters: 200, towers: 160, passive: 1213, other: 500 }; player.gold = 3073; }
  updateIncomeSnapshots(state);
  assert.equal(currentIncomeSnapshot(state)!.status, 'ready');
  assert.equal(currentIncomeSnapshot(state)!.players[0].values.kills.value, 0);
  assert.equal(currentIncomeSnapshot(state)!.players[0].values.kills.source, 'api');
  const inconsistent = realGame(600);
  inconsistent.players[0].gold = 500;
  inconsistent.players[0].income = { minions: 1800, kills: 300 };
  updateIncomeSnapshots(inconsistent);
  assert.equal(currentIncomeSnapshot(inconsistent)!.players[0].totalGold, 500);
  assert.ok(incomeCategories.every(key => currentIncomeSnapshot(inconsistent)!.players[0].values[key].value === null));
});

test('saved snapshots persist across restart, isolate mode/series/game, and preserve team identity through side swaps', () => {
  const state = realGame(600);
  updateIncomeSnapshots(state);
  const sample = structuredClone(currentIncomeSnapshot(state)!);
  const restarted = JSON.parse(JSON.stringify(state)) as BroadcastState;
  resetRuntimeState(restarted);
  assert.deepEqual(currentIncomeSnapshot(restarted), sample);
  const blue = restarted.match.blueTeamId;
  restarted.match.blueTeamId = restarted.match.redTeamId;
  restarted.match.redTeamId = blue;
  assert.deepEqual(currentIncomeSnapshot(restarted), sample);
  restarted.match.game++;
  assert.equal(currentIncomeSnapshot(restarted), undefined);
  restarted.match.game--;
  restarted.match.seriesId = 'another-series';
  assert.equal(currentIncomeSnapshot(restarted), undefined);
  restarted.match.seriesId = state.match.seriesId;
  restarted.mode = 'demo';
  assert.notEqual(incomeGameKey(restarted), sample.gameKey);
});

test('a previous replay lineup under the same fixture cannot become the current ten-minute card or export',()=>{
  const state=realGame(604);state.match.seriesId='reused-fixture';
  const previousChampions=['Rumble','Volibear','Fizz','Braum','Ivern','Kennen','Poppy','TwistedFate','Veigar','Nautilus'];
  state.players=state.players.map((player,index)=>({...player,id:`live-previous-${index}`,championId:previousChampions[index]}));
  updateIncomeSnapshots(state);
  const previous=currentIncomeSnapshot(state)!;
  previous.gameKey=JSON.stringify([state.mode,state.match.seriesId,state.match.game,[state.match.blueTeamId,state.match.redTeamId].sort()]);previous.id='legacy-replay-card';
  const archived=structuredClone(previous);
  assert.equal(currentIncomeSnapshot(state),previous);
  const currentChampions=['Darius','Sylas','Zed','Yunara','Lulu','Jayce','Graves','Ekko','Jhin','Rakan'];
  state.gameTime=490;
  state.players=state.players.map((player,index)=>({...player,id:`live-current-${index}`,championId:currentChampions[index],gold:null,statsSource:'api',statsAvailable:true,statsGameTime:490,statsSampledAt:new Date().toISOString()}));
  assert.equal(currentIncomeSnapshot(state),undefined);
  assert.equal(snapshotRecording(state).incomeSnapshots,undefined);
  assert.deepEqual(state.incomeSnapshots!.find(card=>card.id===archived.id),archived);
  const fullCurrentRoster=state.players;
  state.gameTime=601;state.players=fullCurrentRoster.slice(0,9);updateIncomeSnapshots(state);
  assert.equal(currentIncomeSnapshot(state),undefined);assert.deepEqual(state.incomeSnapshots!.find(card=>card.id===archived.id),archived);
  state.players=fullCurrentRoster;
  state.gameTime=601;for(const player of state.players)player.statsGameTime=601;
  updateIncomeSnapshots(state);
  const current=currentIncomeSnapshot(state)!;
  assert.notEqual(current.gameKey,archived.gameKey);assert.notEqual(current.id,archived.id);
  assert.deepEqual(current.players.map(player=>player.championId),currentChampions);
  assert.deepEqual(state.incomeSnapshots!.find(card=>card.id===archived.id),archived);
  const restored=structuredClone(state);resetRuntimeState(restored);
  assert.deepEqual(currentIncomeSnapshot(restored),current);
  state.players.reverse();assert.equal(currentIncomeSnapshot(state),current);
  state.players[0].championId='Ashe';assert.equal(currentIncomeSnapshot(state),undefined);
});

test('legacy cards with a shared game key stay isolated by their observed roster during telemetry updates',()=>{
  const state=realGame(600);updateIncomeSnapshots(state);
  const current=currentIncomeSnapshot(state)!;
  current.gameKey=JSON.stringify([state.mode,state.match.seriesId,state.match.game,[state.match.blueTeamId,state.match.redTeamId].sort()]);
  const older=structuredClone(current);older.players[0].championId='Rumble';
  state.incomeSnapshots!.push(older);const archived=structuredClone(older);
  assert.equal(currentIncomeSnapshot(state),current);
  mergeIncomeTelemetry(state,{gameKey:current.gameKey,capturedTime:600,players:[{playerId:current.players[0].playerId,values:{kills:0}}]});
  assert.deepEqual(state.incomeSnapshots!.at(-1),archived);
  assert.equal(currentIncomeSnapshot(state)!.players[0].values.kills.value,0);
});

test('demonstration uses separate marked ten-minute values and skips an LCU placeholder roster in live mode', () => {
  const state = createSeed();
  const sample = createDemoIncomeSnapshot(state);
  assert.equal(sample.mode, 'demo');
  assert.equal(sample.capturedTime, 600);
  assert.notEqual(sample.players[0].totalGold, state.players[0].gold);
  assert.ok(sample.players.every(player => incomeCategories.every(key => player.values[key].source === 'demo')));
  assert.ok(sample.players.every(player => incomeCategories.reduce((sum, key) => sum + (player.values[key].value ?? 0), 0) === player.totalGold));
  const real = realGame(600);
  real.players = real.players.map(player => ({ ...player, id: player.id.replace(/^live-/, 'roster-') }));
  updateIncomeSnapshots(real);
  assert.equal(currentIncomeSnapshot(real), undefined);
});

test('telemetry bridge fills saved ten-minute sources after play has continued and upgrades only a complete card', () => {
  const state = realGame(600.5);
  state.players[0].income = { kills: 0 };
  updateIncomeSnapshots(state);
  const first = currentIncomeSnapshot(state)!;
  const gameKey = first.gameKey;
  state.gameTime = 900;
  const amounts = { kills: 0, minions: 1000, monsters: 200, towers: 160, passive: 1213, other: 500 };
  const partial = mergeIncomeTelemetry(state, { gameKey, capturedTime: 600.5, players: [{ playerId: first.players[0].playerId, values: amounts }] });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.capturedTime, 600.5);
  assert.equal(partial.players[0].values.kills.source, 'api');
  assert.equal(partial.players[0].values.minions.source, 'telemetry');
  assert.equal(partial.players[1].values.minions.value, null);
  const complete = mergeIncomeTelemetry(state, { gameKey, capturedTime: 600.5, players: partial.players.slice(1).map(player => ({ playerId: player.playerId, values: amounts })) });
  assert.equal(complete.status, 'ready');
  assert.equal(state.gameTime, 900);
  const resumed = JSON.parse(JSON.stringify(state)) as BroadcastState;
  resetRuntimeState(resumed);
  assert.deepEqual(currentIncomeSnapshot(resumed), complete);
  assert.throws(() => mergeIncomeTelemetry(state, { gameKey, capturedTime: 600.5, players: [{ playerId: complete.players[0].playerId, values: amounts }] }), /仅可补齐/);
});

test('telemetry bridge atomically rejects a different game, late timestamp, unknown players, invalid amounts and changes to confirmed values', () => {
  const state = realGame(600);
  state.players[0].gold = 500;
  state.players[0].income = { kills: 0 };
  updateIncomeSnapshots(state);
  const snapshot = currentIncomeSnapshot(state)!;
  const base = { gameKey: snapshot.gameKey, capturedTime: 600, players: [{ playerId: snapshot.players[0].playerId, values: { minions: 100 } }] };
  const cases = [
    { ...base, gameKey: 'another-game' }, { ...base, capturedTime: 660 }, { ...base, capturedTime: 600.5 },
    { ...base, players: [{ playerId: 'unknown', values: { minions: 100 } }] },
    { ...base, players: [base.players[0], base.players[0]] },
    { ...base, players: [{ ...base.players[0], values: { minions: -5 } }] },
    { ...base, players: [{ ...base.players[0], values: { minions: Infinity } }] },
    { ...base, players: [{ ...base.players[0], values: { minions: '100' } }] },
    { ...base, players: [{ ...base.players[0], values: { creepScore: 100 } }] },
    { ...base, players: [{ ...base.players[0], values: { kills: 300 } }] },
    { ...base, players: [{ ...base.players[0], values: { minions: 600 } }] },
    { ...base, players: [{ ...base.players[0], totalGold: 600 }] },
    { ...base, players: [base.players[0], { playerId: snapshot.players[1].playerId, values: { towers: -1 } }] },
  ];
  for (const payload of cases) { assert.throws(() => mergeIncomeTelemetry(state, payload)); assert.deepEqual(currentIncomeSnapshot(state), snapshot); }
  const late = realGame(650);
  updateIncomeSnapshots(late);
  assert.throws(() => mergeIncomeTelemetry(late, base), /先取得/);
  const missing = realGame(590);
  assert.throws(() => mergeIncomeTelemetry(missing, base), /先取得/);
});

test('recordings detach the current income card from later ticks and telemetry changes, and CSV preserves source and missing values', () => {
  let demo = createSeed();
  const original = structuredClone(currentIncomeSnapshot(demo)!);
  demo.incomeSnapshots!.push({ ...structuredClone(original), id: 'old-card', gameKey: 'other-game' });
  demo = applyAction(demo, { type: 'save-recording' });
  assert.equal(demo.recordings[0].incomeSnapshots!.length, 1);
  assert.deepEqual(demo.recordings[0].incomeSnapshots![0], original);
  for (let index = 0; index < 20; index++) tickDemo(demo);
  currentIncomeSnapshot(demo)!.players[0].values.minions.value = 9999;
  assert.deepEqual(demo.recordings[0].incomeSnapshots![0], original);
  const csv = csvRecording(demo.recordings[0]);
  assert.match(csv, /十分钟经济来源/);
  assert.match(csv, /实际采样秒数/);
  assert.match(csv, /小兵来源/);
  assert.match(csv, /演示/);
  const real = realGame(600);
  for(const player of real.players){player.statsSource='api';player.statsSampledAt=new Date().toISOString();player.statsGameTime=600;}
  real.players[0].gold = null;
  updateIncomeSnapshots(real);
  const saved = applyAction(real, { type: 'save-recording' });
  const frozen = structuredClone(saved.recordings[0].incomeSnapshots![0]);
  const liveCard = currentIncomeSnapshot(saved)!;
  mergeIncomeTelemetry(saved, { gameKey: liveCard.gameKey, capturedTime: 600, players: [{ playerId: liveCard.players[0].playerId, totalGold: 3073, values: { kills: 0, minions: 1000, monsters: 200, towers: 160, passive: 1213, other: 500 } }] });
  assert.deepEqual(saved.recordings[0].incomeSnapshots![0], frozen);
  frozen.players[0].name = '=FORMULA()';
  saved.recordings[0].incomeSnapshots = [frozen];
  const realCsv = csvRecording(saved.recordings[0]);
  assert.match(realCsv, /未提供/);
  assert.match(realCsv, /'=FORMULA\(\)/);
  const oldFormat = structuredClone(saved.recordings[0]);
  delete oldFormat.incomeSnapshots;
  assert.doesNotThrow(() => csvRecording(oldFormat));
});

test('demo combat health, resources and spells animate only in demo mode and death timers recover', () => {
  const state = createSeed();
  assert.ok(state.players.every(player => player.health! > 0 && player.health! <= player.maxHealth! && player.resource! >= 0 && player.resource! <= player.maxResource! && player.summonerSpells?.length === 2));
  const initialHealth = state.players[0].health;
  tickDemo(state);
  assert.notEqual(state.players[0].health, initialHealth);
  state.gameTime = 1169;
  tickDemo(state);
  const victim = state.players.find(player => player.isDead)!;
  assert.equal(victim.health, 0);
  assert.equal(victim.respawnTimer, 12);
  for (let index = 0; index < 12; index++) tickDemo(state);
  assert.equal(victim.isDead, false);
  assert.equal(victim.respawnTimer, 0);
  assert.ok(victim.health! > 0 && victim.health! <= victim.maxHealth!);
  const beforePause = structuredClone(state.players);
  state.paused = true;
  tickDemo(state);
  assert.deepEqual(state.players, beforePause);
  const real = applyAction(state, { type: 'set-mode', mode: 'live' });
  assert.deepEqual(real.players, []);
  tickDemo(real);
  assert.deepEqual(real.players, []);
});
