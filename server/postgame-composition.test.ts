import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './test-support/fixture';
import { finalizeGame, absorbTerminalGameSample } from './game-results';
import { enrichPostgame } from './postgame-data';
import { frozenGameState } from '../shared/game-results';
import { reportDamage, reportDamageComposition } from '../shared/postgame-damage';
import { bundledChampions } from '../shared/champion-art';
import { normalizeLive } from './adapters';

test('official damage types survive result snapshot, recording, serialization and frozen report after disconnect', () => {
  const state = createFixture(), champions = bundledChampions(), player = state.players[0];
  const champion = champions.find(c => c.id === player.championId)!;
  const result = finalizeGame(state, { source: 'manual', sourceGameId: '301' })!;
  const payload = { gameId: 301, teams: [{ teamId: player.team === 'blue' ? 100 : 200, players: [{ championId: champion.key, stats: { TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 9000, PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS: 6000, MAGIC_DAMAGE_DEALT_TO_CHAMPIONS: 2500, TRUE_DAMAGE_DEALT_TO_CHAMPIONS: 500 } }] }] };
  enrichPostgame(state, payload, champions);
  const expected = { physical: 6000, magic: 2500, true: 500 };
  assert.deepEqual(reportDamageComposition(result.snapshot.players[0]), expected);
  assert.deepEqual(reportDamageComposition(state.recordings.find(r => r.id === result.id)!.players[0]), expected);
  state.connections.live.status = 'disconnected';
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.deepEqual(reportDamageComposition(frozenGameState(reloaded).players[0]), expected);
  enrichPostgame(state, { ...payload, teams: [{ ...payload.teams[0], players: [{ championId: champion.key, stats: { TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 9000 } }] }] }, champions);
  assert.deepEqual(reportDamageComposition(result.snapshot.players[0]), expected);
  enrichPostgame(state, { ...payload, teams: [{ ...payload.teams[0], players: [{ championId: champion.key, stats: { TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 10000 } }] }] }, champions);
  assert.equal(reportDamageComposition(result.snapshot.players[0]), null, 'a changed total cannot retain older component values');
});

test('late terminal types fill an accepted result even when total damage was already present', () => {
  const state = createFixture(); state.players.forEach(p => { p.telemetryDamage = { toChampions: 100 }; p.telemetryDamageSource = 'packets'; p.telemetryDamageSince = 0; });
  const result = finalizeGame(state, { source: 'live', terminal: true })!;
  const sample = { players: structuredClone(state.players), stats: state.stats, events: state.events, gameTime: state.gameTime, ended: true };
  sample.players.forEach(p => { p.telemetryDamage = { toChampions: 100, physicalToChampions: 60, magicToChampions: 40, trueToChampions: 0 }; });
  assert.equal(absorbTerminalGameSample(state, sample), true);
  assert.deepEqual(reportDamageComposition(frozenGameState(state).players[0]), { physical: 60, magic: 40, true: 0 });
  assert.equal(state.recordings.find(r => r.id === result.id)!.players[0].telemetryDamage?.trueToChampions, 0);
  assert.equal(absorbTerminalGameSample(state, sample), false);
});

test('postgame composition accepts zero and complete components, rejects missing or partial-match data', () => {
  const player = createFixture().players[0]; player.telemetryDamage = { physicalToChampions: 0, magicToChampions: 0, trueToChampions: 0 };
  player.telemetryDamageSource = 'postgame'; delete player.damageDealt;
  assert.deepEqual(reportDamageComposition(player), { physical: 0, magic: 0, true: 0 }); assert.equal(reportDamage(player, 'damageDealt'), 0);
  delete player.telemetryDamage.magicToChampions; assert.equal(reportDamageComposition(player), null);
  player.telemetryDamage.magicToChampions = -1; assert.equal(reportDamageComposition(player), null);
  player.telemetryDamage.magicToChampions = 1; player.telemetryDamageSource = 'packets'; player.telemetryDamageSince = 50;
  assert.equal(reportDamageComposition(player), null); assert.equal(reportDamage(player, 'damageDealt'), undefined);
});

test('Live Client Assisters reach normalized events and the saved result without synthesizing absent lists', () => {
  const events = normalizeLive({ allPlayers: [], gameData: { gameTime: 30 }, events: { Events: [
    { EventID: 1, EventTime: 20, EventName: 'ChampionKill', KillerName: 'A', VictimName: 'B', Assisters: ['C', 'D'] },
    { EventID: 2, EventTime: 25, EventName: 'ChampionKill', KillerName: 'A', VictimName: 'B' },
  ] } }, []).events;
  assert.deepEqual(events[0].assistants, ['C', 'D']); assert.equal(events[1].assistants, undefined);
  const state = createFixture(); state.events = events;
  const result = finalizeGame(state, { source: 'manual' })!;
  assert.deepEqual(result.snapshot.events[0].assistants, ['C', 'D']);
  assert.deepEqual(state.recordings.find(r => r.id === result.id)!.events[0].assistants, ['C', 'D']);
});
