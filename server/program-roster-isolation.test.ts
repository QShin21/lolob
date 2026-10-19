import { createFixture as createSeed, emptyFixture } from './test-support/fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Adapters, ChampionCatalog } from './adapters';
import { applyAction, normalizeSavedState, publicState, resetRuntimeState } from './state';
import { captureProgram, playerIdentity, programState, publishProgram } from '../shared/production';
import { pendingContent } from '../shared/presentation';
import { bottomPlayers } from './bottom-scoreboard';
import { goldRanking } from '../shared/gold-ranking';
import { resolvedPlayerFeed } from '../shared/player-feeds';
import type { BroadcastState } from '../shared/types';

const identities = (s: BroadcastState) => s.players.map(playerIdentity);
const edit = (s: BroadcastState) => applyAction(s, { type: 'set-draft', patch: { bluePicks: ['Akali', ...s.draft.bluePicks.slice(1)] } });
const restore = (s: BroadcastState) => applyAction(s, { type: 'production', command: { op: 'draft-mode', mode: 'auto', resolution: 'client' } });
const undo = (s: BroadcastState) => applyAction(s, { type: 'production', command: { op: 'immediate', action: 'undo' } });
function seed() {
  const s = createSeed();
  s.phase = 'draft'; s.paused = true; s.programScene = s.previewScene = 'lineup';
  s.production!.rules.mode = 'standard';
  s.production!.program = captureProgram(s);
  return s;
}
function sample(s: BroadcastState, championId: string, championName = championId) {
  s.draft.bluePicks[0] = championId;
  Object.assign(s.players[0], { championId, championName });
}
function takeover() {
  let s = seed(); sample(s, 'Gwen', '灵罗娃娃');
  const visible = structuredClone(programState(s));
  s = edit(s);
  s.production!.clientDraft = {
    draft: structuredClone(s.production!.program!.draft),
    players: structuredClone(s.production!.program!.telemetry.players), at: new Date().toISOString(),
  };
  return { s: restore(s), visible };
}

test('actual LCU collector: automatic progression, manual comparison, restored roster and source all wait for TAKE', async () => {
  let s = seed(); s.mode = 'live'; s.production!.program = captureProgram(s);
  let championId = 266;
  const adapters = new Adapters(() => s, work => work(s), new ChampionCatalog('/tmp/unused-roster-catalog'), async (_port, route) => {
    if (route === '/lol-gameflow/v1/session') return { phase: 'ChampSelect', gameData: { gameId: 777 } };
    assert.equal(route, '/lol-champ-select/v1/session', 'only synthetic LCU transport is allowed');
    const roster = Array.from({ length: 10 }, (_, i) => ({ puuid: `test-${i}`, cellId: i, teamId: i < 5 ? 100 : 200,
      gameName: `选手${i}`, assignedPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i % 5], championId: i === 0 ? championId : 0 }));
    return { myTeam: roster.slice(0, 5), theirTeam: roster.slice(5), timer: { adjustedTimeLeftInPhase: 24000 },
      actions: [[{ id: 0, type: 'pick', actorCellId: 0, championId, completed: true }]] };
  });
  // Test seam only: no discovery of the user's lockfile and no network or OBS initialization.
  const collector = adapters as unknown as { credentials: { port: number; password: string; protocol: 'https' }; pollLcu(): Promise<void> };
  collector.credentials = { port: 59991, password: 'synthetic', protocol: 'https' };
  try {
    await collector.pollLcu(); s = applyAction(s, { type: 'take', scene: 'lineup' });
    const accepted = structuredClone(s.production!.program);
    championId = 887; await collector.pollLcu();
    assert.equal(programState(s).players[0].championId, 'Gwen', 'uninterrupted auto updates the lineup');
    assert.deepEqual(pendingContent(s), [], 'automatic BP and roster samples are not pending edits');
    s = edit(s);
    championId = 266; await collector.pollLcu();
    assert.equal(s.production!.clientDraft!.players[0].championId, 'Aatrox');
    assert.equal(s.players[0].championId, 'Gwen', 'manual mode only gathers comparison samples');
    s = restore(s);
    assert.deepEqual(s.draft, accepted!.draft, 'the restored BP exactly equals the old TAKE snapshot');
    assert.equal(s.players[0].championId, 'Aatrox');
    assert.equal(programState(s).players[0].championId, 'Gwen', 'lineup remains the picture seen at handoff');
    assert.equal(programState(s).draft.bluePicks[0], 'Gwen');
    assert.deepEqual(s.production!.program, accepted);
    assert.ok(pendingContent(s).includes('BP'));
    assert.ok(pendingContent(s).includes('英雄归属'));
    championId = 150; await collector.pollLcu();
    assert.equal(programState(s).players[0].championId, 'Gwen', 'later samples cannot bypass the source handoff');
    s = applyAction(s, { type: 'take', scene: 'lineup' });
    assert.equal(programState(s).players[0].championId, 'Gnar');
    championId = 22; await collector.pollLcu();
    assert.equal(programState(s).players[0].championId, 'Ashe', 'automatic progression resumes after TAKE');
    assert.deepEqual(pendingContent(s), []);
  } finally { await adapters.close(); }
});

test('roster identity and membership stay on air while same-ID statistics, items and clocks keep advancing', () => {
  const { s, visible } = takeover();
  const first = s.players[0];
  Object.assign(first, { name: '待播替换名', portrait: '/uploads/pending.png', team: 'red', role: '辅助',
    kills: 19, cs: 299, gold: 23456, items: [1001], health: 450, maxHealth: 1000,
    statsSampledAt: '2026-10-14T12:00:00Z', goldExpiresAt: '2026-10-14T12:00:10Z' });
  const missing = s.players.splice(1, 1)[0];
  s.players.push({ ...missing, id: 'pending-substitute', name: '待播替补', kills: 99 });
  s.players.reverse(); s.gameTime += 8; s.stats.blue.kills += 3;
  const view = programState(s), player = view.players.find(p => p.id === first.id)!;
  assert.deepEqual(identities(view), identities(visible), 'all fields and roster slots use the visible handoff');
  for (const key of ['kills', 'cs', 'gold', 'items', 'health', 'maxHealth', 'statsSampledAt', 'goldExpiresAt'] as const)
    assert.deepEqual(player[key], first[key], `${key} is telemetry, not held identity`);
  assert.equal(view.players.find(p => p.id === missing.id)!.kills, missing.kills, 'never borrow a substitute sample by position');
  assert.equal(view.gameTime, s.gameTime); assert.equal(view.stats.blue.kills, s.stats.blue.kills);
  assert.equal(bottomPlayers(view, 'blue')[0]!.championId, 'Gwen', 'live five-row geometry consumes the held identity');
  assert.equal(goldRanking(view).find(row => row.player.id === first.id)!.player.championId, 'Gwen');
  assert.equal(goldRanking(view).find(row => row.player.id === first.id)!.gold, 23456);
  assert.equal(resolvedPlayerFeed(view, 'blue', 0).label, visible.players[0].name, 'automatic feed labels share the same boundary');
});

test('a restored equal picture still reports that automatic synchronization awaits TAKE', () => {
  let s = seed(); s = edit(s);
  s.production!.clientDraft = { draft: structuredClone(s.production!.program!.draft), players: structuredClone(s.players), at: new Date().toISOString() };
  s = restore(s);
  assert.deepEqual(s.draft, programState(s).draft);
  assert.ok(pendingContent(s).includes('BP'), 'equal heroes do not silently resume an unaccepted source');
  s = applyAction(s, { type: 'take', scene: 'lineup' });
  assert.deepEqual(pendingContent(s), []);
});

test('an unavailable automatic sample after restart is not counted as an editorial BP or roster change', () => {
  const s = seed(); s.mode = 'live'; s.production!.program = captureProgram(s);
  resetRuntimeState(s);
  assert.equal(s.players.length, 0, 'runtime data was cleared while awaiting a fresh sample');
  assert.deepEqual(pendingContent(s), [], 'normal source availability is not a pending edit');
});

for (const manualTake of [false, true]) test(`restore, application failure, re-TAKE and undo/redo preserve roster identity (manual TAKE=${manualTake})`, () => {
  let { s, visible } = takeover();
  if (manualTake) {
    s = edit(s); s = applyAction(s, { type: 'take', scene: 'lineup' });
    // Accepted manual BP still allows legitimate same-game live player samples.
    sample(s, 'Ashe', '寒冰射手'); visible = structuredClone(programState(s));
    s.production!.clientDraft = { draft: { ...structuredClone(s.draft), bluePicks: ['Gnar'] }, players: structuredClone(s.players), at: new Date().toISOString() };
    s.production!.clientDraft.players[0].championId = 'Gnar';
    s = restore(s);
  }
  const pending = structuredClone(s.players);
  const candidate = applyAction(s, { type: 'take', scene: 'lineup' });
  assert.deepEqual(identities(programState(s)), identities(visible), 'preparation/failure cannot expose the candidate');
  s.players[0].cs += 10;
  publishProgram(s, candidate);
  assert.equal(s.production!.programRosterHold, undefined);
  assert.equal(s.production!.programDraftHold, undefined);
  assert.equal(programState(s).players[0].championId, pending[0].championId);
  assert.equal(programState(s).players[0].cs, s.players[0].cs, 'application does not roll back in-flight telemetry');
  s = undo(s);
  assert.deepEqual(identities(programState(s)), identities(visible));
  assert.equal(s.players[0].championId, pending[0].championId, 'undo leaves pending content intact');
  s = undo(s);
  assert.equal(programState(s).players[0].championId, pending[0].championId);
});

test('assignment edits hold the current automatic hero, including repeated edits and removal, until TAKE', () => {
  let s = seed(); sample(s, 'Gwen', '灵罗娃娃');
  const visible = identities(programState(s));
  const assign = (championId: string) => { s = applyAction(s, { type: 'production', command: { op: 'assign',
    assignments: [{ playerId: s.players[0].id, team: 'blue', championId, role: '下路', locked: true }] } }); };
  assign(s.draft.bluePicks[3]); assert.deepEqual(identities(programState(s)), visible);
  assign(s.draft.bluePicks[2]); assert.deepEqual(identities(programState(s)), visible);
  s = applyAction(s, { type: 'production', command: { op: 'assign', assignments: [] } });
  assert.deepEqual(identities(programState(s)), visible, 'removing a pending mapping cannot reveal its mutated players');
  assert.ok(pendingContent(s).includes('英雄归属'));
  s.draft.timer = 8; assert.equal(programState(s).draft.timer, 8, 'assignment staging does not pause automatic BP');
  s = applyAction(s, { type: 'take', scene: 'lineup' });
  assert.equal(programState(s).players[0].championId, s.players[0].championId);
});

test('an unchanged mapping does not pause auto, while reverting a staged mapping still reports its held source', () => {
  let s = seed();
  s = applyAction(s, { type: 'production', command: { op: 'assign', assignments: [] } });
  sample(s, 'Gwen', '灵罗娃娃');
  assert.equal(programState(s).players[0].championId, 'Gwen');
  assert.deepEqual(pendingContent(s), []);
  const players = structuredClone(s.players);
  s = applyAction(s, { type: 'production', command: { op: 'assign', assignments: [
    { playerId: s.players[0].id, team: 'blue', championId: s.draft.bluePicks[3], role: '下路', locked: true },
  ] } });
  s = applyAction(s, { type: 'production', command: { op: 'assign', assignments: [] } });
  s.players = players;
  assert.deepEqual(identities(s), identities(programState(s)));
  assert.deepEqual(s.production!.assignments, s.production!.program!.assignments);
  assert.ok(pendingContent(s).includes('英雄归属'), 'automatic roster following is still held until TAKE');
});

test('held roster survives save/restart, new attempts and legacy undo without crossing match identity', () => {
  let { s, visible } = takeover();
  s = normalizeSavedState(JSON.parse(JSON.stringify(publicState(s)))); resetRuntimeState(s);
  assert.deepEqual(identities(programState(s)), identities(visible));
  s.players=structuredClone(visible.players);s.phase='live';
  s.players[0].cs += 9;
  const lastCs = programState(s).players[0].cs;
  s = applyAction(s, { type: 'production', command: { op: 'remake', reason: '隔离回归重赛' } });
  s.players = structuredClone(visible.players); s.players[0].cs = 900; sample(s, 'Ashe');
  assert.deepEqual(identities(programState(s)), identities(visible));
  assert.equal(programState(s).players[0].cs, lastCs, 'a new attempt must not supply old-programme telemetry');
  s = applyAction(s, { type: 'take', scene: 'lineup' });
  const oldPlayers = structuredClone(s.production!.previousProgram!.content.telemetry.players);
  delete s.production!.previousProgram!.rosterHold;
  s = undo(s);
  assert.deepEqual(identities(programState(s)), oldPlayers.map(playerIdentity), 'legacy undo uses accepted telemetry, never pending membership');
});

test('legacy BP-only holds cannot infer assignments from picks or expose pending player identities', () => {
  const { s } = takeover(); delete s.production!.programRosterHold;
  s.players[0].championId = 'Ashe';
  assert.deepEqual(identities(programState(s)), s.production!.program!.telemetry.players.map(playerIdentity));
  assert.equal(programState(s).draft.bluePicks[0], 'Gwen');
});
