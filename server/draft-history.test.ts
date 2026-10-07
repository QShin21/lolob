import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { BroadcastState, DraftState, Player } from '../shared/types';
import { applyAction, createSeed, fallbackChampionData, resetRuntimeState } from './state';
import { captureLiveDraft, getFearlessBans, getFearlessHistory, historyForTeam, initializeDraftHistory, observeLcuDraft } from './draft-history';
import { Adapters, ChampionCatalog } from './adapters';

const picks = (offset = 0) => ({ bluePicks: fallbackChampionData.slice(offset, offset + 5).map(champion => champion[0]), redPicks: fallbackChampionData.slice(offset + 5, offset + 10).map(champion => champion[0]) });
const draft = (offset = 0, locked = true): DraftState => ({ ...picks(offset), blueBans: [], redBans: [], timer: 0, activeTeam: 'blue', action: '选择英雄', locked });
function fresh(): BroadcastState {
  return applyAction(applyAction(createSeed(), { type: 'set-mode', mode: 'live' }), { type: 'set-match', patch: { game: 1, seriesId:'draft-fixture-series', blueScore:0, redScore:0 } });
}
function advance(state:BroadcastState):BroadcastState{
  state.players=roster().map(p=>({...p,statsSource:'api',statsSampledAt:new Date().toISOString()}));state.events=[];
  state=applyAction(state,{type:'finalize-game',winner:'blue'});
  state=applyAction(state,{type:'production',command:{op:'accept-final',reason:'fixture final sample unavailable'}});
  return applyAction(state,{type:'next-game'});
}
const entries = (state: BroadcastState) => (state.draftHistory ?? []).filter(entry => entry.seriesId === state.match.seriesId);
function roster(offset = 0): Player[] {
  const ids = [...picks(offset).bluePicks, ...picks(offset).redPicks];
  return createSeed().players.map((player, index) => ({ ...player, championId: ids[index] }));
}

test('locked LCU candidates become history only when gameflow confirms game start', () => {
  let state = fresh();
  observeLcuDraft(state, { phase: 'ChampSelect', draft: draft(), players: roster(), gameId: 123 });
  assert.equal(entries(state).length, 0);
  assert.ok(state.draftHistoryPending);
  observeLcuDraft(state, { phase: 'GameStart', gameId: 123 });
  observeLcuDraft(state, { phase: 'InProgress', gameId: 123 });
  assert.equal(entries(state).length, 1);
  assert.equal(entries(state)[0].sourceGameId, '123');
  assert.equal(state.draftHistoryPending, undefined);
  state = advance(state);
  assert.deepEqual(getFearlessHistory(state).map(entry => entry.game), [1]);
  assert.equal(getFearlessBans(state).size, 10);
});

test('hovered complete rosters and cancelled final drafts never create global bans', () => {
  const state = fresh();
  observeLcuDraft(state, { phase: 'ChampSelect', draft: draft(0, false), players: roster() });
  observeLcuDraft(state, { phase: 'InProgress' });
  assert.equal(entries(state).length, 0);
  observeLcuDraft(state, { phase: 'ChampSelect', draft: draft(), players: roster() });
  observeLcuDraft(state, { phase: 'Lobby' });
  observeLcuDraft(state, { phase: 'InProgress' });
  assert.equal(entries(state).length, 0);
  assert.equal(state.draftHistoryPending, undefined);
});

test('final roster trades and side changes retain the champions under the original team IDs', () => {
  let state = fresh();
  const traded = roster();
  [traded[0].championId, traded[5].championId] = [traded[5].championId, traded[0].championId];
  observeLcuDraft(state, { phase: 'ChampSelect', draft: draft(), players: traded });
  observeLcuDraft(state, { phase: 'InProgress', gameId: 'match-1' });
  state = advance(state); state = applyAction(state, { type: 'set-match', patch: { blueTeamId: 'ember', redTeamId: 'azure' } });
  assert.equal(entries(state).length, 1);
  assert.deepEqual(historyForTeam(state, state.match.blueTeamId)[0].picks, traded.slice(5).map(player => player.championId));
  assert.deepEqual(historyForTeam(state, state.match.redTeamId)[0].picks, traded.slice(0, 5).map(player => player.championId));
  assert.equal(getFearlessBans(state).size, 10);
});

test('full live spectating rosters update one game without duplicating history', () => {
  const state = fresh();
  state.players = roster();
  captureLiveDraft(state, 123);
  const recordedAt = entries(state)[0].recordedAt;
  [state.players[0].championId, state.players[1].championId] = [state.players[1].championId, state.players[0].championId];
  captureLiveDraft(state, 123);
  captureLiveDraft(state, 123);
  assert.equal(entries(state).length, 1);
  assert.equal(entries(state)[0].source, 'live');
  assert.equal(entries(state)[0].recordedAt, recordedAt);
  assert.deepEqual(entries(state)[0].bluePicks, state.players.slice(0, 5).map(player => player.championId));
  assert.equal(state.draft.locked, true);
  state.players.pop();
  captureLiveDraft(state, 123);
  assert.equal(entries(state)[0].redPicks.length, 5);
});

test('an old live sample after advancing the game number cannot become the next game', () => {
  let state = fresh();
  state.players = roster();
  captureLiveDraft(state, 123);
  state = advance(state);
  state.players = roster();
  captureLiveDraft(state);
  assert.deepEqual(entries(state).map(entry => entry.game), [1]);
  state.players = roster(10);
  captureLiveDraft(state, 123);
  assert.deepEqual(entries(state).map(entry => entry.game), [1]);
  captureLiveDraft(state, 124);
  assert.deepEqual(entries(state).map(entry => entry.game), [1, 2]);
});

test('restart retains both completed history and a pending locked draft for reconnect', () => {
  let state = fresh();
  observeLcuDraft(state, { phase: 'ChampSelect', draft: draft(), players: roster(), gameId: 123 });
  state = JSON.parse(JSON.stringify(state)) as BroadcastState;
  const seriesId = state.match.seriesId;
  resetRuntimeState(state);
  assert.equal(state.match.seriesId, seriesId);
  assert.equal(state.players.length, 0);
  assert.ok(state.draftHistoryPending);
  observeLcuDraft(state, { phase: 'InProgress', gameId: 123 });
  resetRuntimeState(state);
  assert.equal(entries(state).length, 1);
  assert.equal(state.match.seriesId, seriesId);
});

test('different fixtures and restarted series isolate their global bans while retaining history', () => {
  let state = fresh();
  state.players = roster();
  captureLiveDraft(state, 123);
  const oldSeries = state.match.seriesId;
  state = applyAction(state, { type: 'load-match', matchId: 'm2' });
  assert.equal(state.match.seriesId, 'live:schedule:m2');
  assert.equal(getFearlessHistory(state).length, 0);
  assert.equal(getFearlessBans(state).size, 0);
  assert.ok(state.draftHistory?.some(entry => entry.seriesId === oldSeries));
  state = advance(state);
  state = applyAction(state, { type: 'set-match', patch: { game: 1, seriesId:'restart-fixture-series', blueScore:0, redScore:0 } });
  assert.notEqual(state.match.seriesId, 'live:schedule:m2');
});

test('manual complete drafts require entering live and reject previous picks on either side', () => {
  let state = fresh();
  state = applyAction(state, { type: 'set-phase', phase: 'draft' });
  state = applyAction(state, { type: 'set-draft', patch: picks() });
  assert.equal(entries(state).length, 0);
  state = applyAction(state, { type: 'set-phase', phase: 'live' });
  assert.equal(entries(state).length, 1);
  state = advance(state);
  assert.throws(() => applyAction(state, { type: 'set-draft', patch: { bluePicks: [picks().redPicks[0]] } }), /全局禁用/);
  assert.deepEqual(state.draft.bluePicks, []);
  state = applyAction(state, { type: 'set-draft', patch: { bluePicks: picks(10).bluePicks } });
  state = applyAction(state, { type: 'set-phase', phase: 'live' });
  assert.equal(entries(state).length, 1);
  assert.throws(() => applyAction(state, { type: 'set-draft', patch: { redPicks: [picks(10).bluePicks[0]] } }), /不能重复/);
});

test('legacy history migration rejects malformed entries and keeps valid series records', () => {
  const state = fresh();
  state.players = roster();
  captureLiveDraft(state);
  const original = structuredClone(entries(state)[0]);
  state.draftHistory = [original, { ...original, game: -1 }, { ...original, bluePicks: ['Ahri'] }];
  initializeDraftHistory(state);
  assert.deepEqual(state.draftHistory, [original]);
  assert.equal(getFearlessHistory(state).length, 0);
});

test('delayed LCU and manual phase changes preserve the authoritative live roster', () => {
  let state = fresh();
  state.players = roster();
  captureLiveDraft(state, 123);
  const livePicks = structuredClone(entries(state)[0]);
  observeLcuDraft(state, { phase: 'ChampSelect', draft: draft(10), players: roster(10), gameId: 123 });
  observeLcuDraft(state, { phase: 'InProgress', gameId: 123 });
  assert.deepEqual(entries(state)[0], livePicks);
  state.draft = draft(10);
  state = applyAction(state, { type: 'set-phase', phase: 'live' });
  assert.deepEqual(entries(state)[0], livePicks);
});

test('new broadcast scenes and native HUD modes are validated through state actions', () => {
  let state = fresh();
  state.players=roster();state.phase='live';
  state = applyAction(state, { type: 'preview-scene', scene: 'teamfight' });
  state = applyAction(state, { type: 'take', scene: 'gold-ranking' });
  assert.equal(state.previewScene, 'teamfight');
  assert.equal(state.programScene, 'gold-ranking');
  assert.equal(state.overlay.nativeHud, 'auto');
  assert.equal(applyAction(state, { type: 'set-overlay', patch: { nativeHud: 'mask' } }).overlay.nativeHud, 'mask');
  assert.throws(() => applyAction(state, { type: 'set-overlay', patch: { nativeHud: 'invalid' } }));
});

test('LCU polling stages the final draft and commits gameflow start through the real adapter hook', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riftcast-draft-history-'));
  const lockfile = path.join(directory, 'lockfile');
  await writeFile(lockfile, 'LeagueClient:0:12345:local-test-only:https');
  const state = fresh();
  state.settings.lockfilePath = lockfile;
  let phase = 'ChampSelect';
  const champions = fallbackChampionData.slice(0, 10);
  const session = {
    myTeam: champions.slice(0, 5).map((champion, index) => ({ cellId: index, teamId: 100, championId: champion[1], summonerId: index + 1 })),
    theirTeam: champions.slice(5).map((champion, index) => ({ cellId: index + 5, teamId: 200, championId: champion[1], summonerId: index + 6 })),
    actions: champions.map((champion, index) => [{ id: index, actorCellId: index, type: 'pick', completed: true, championId: champion[1] }]),
  };
  const adapters = new Adapters(() => state, work => work(state), new ChampionCatalog('.'), async (_port, endpoint) => {
    if (endpoint === '/lol-gameflow/v1/session') return { phase, gameData: { gameId: 123 } };
    if (endpoint === '/lol-champ-select/v1/session') return session;
    throw new Error(`意外的测试接口：${endpoint}`);
  });
  try {
    await adapters.connect('lcu');
    assert.equal(state.draft.locked, true);
    assert.equal(entries(state).length, 0);
    assert.ok(state.draftHistoryPending);
    phase = 'InProgress';
    await adapters.poll();
    assert.equal(entries(state).length, 1);
    assert.equal(entries(state)[0].sourceGameId, '123');
    assert.deepEqual(entries(state)[0].bluePicks, picks().bluePicks);
  } finally {
    await adapters.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  }
});

test('live polling commits a complete spectator roster through the adapter and retains it across disconnect', async () => {
  const state = fresh();
  let unavailable = false;
  const adapters = new Adapters(() => state, work => work(state), new ChampionCatalog('.'), async () => {
    if (unavailable) throw new Error('测试断线');
    return { allPlayers: fallbackChampionData.slice(0, 10).map((champion, index) => ({ riotId: `Player${index}#TEST`, team: index < 5 ? 'ORDER' : 'CHAOS', rawChampionName: `game_character_displayname_${champion[0]}` })), gameData: { gameTime: 100, gameId: 456 } };
  });
  try {
    await adapters.connect('live');
    assert.equal(entries(state).length, 1);
    assert.equal(entries(state)[0].source, 'live');
    assert.equal(entries(state)[0].sourceGameId, '456');
    unavailable = true;
    await adapters.poll();
    assert.equal(state.connections.live.status, 'error');
    assert.equal(entries(state).length, 1);
  } finally { await adapters.close(); }
});
