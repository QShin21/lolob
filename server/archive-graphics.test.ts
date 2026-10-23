import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './test-support/fixture';
import { finalizeGame } from './game-results';
import { archiveDamage, archiveFearless, archiveItemEvents, archiveItemParticipants, archiveMetrics, archiveRole, archiveSeries, archiveWinner, graphicArchives } from '../shared/archive-graphics';
import { bundledChampions } from '../shared/champion-art';
import type { GameResult } from '../shared/types';

function fixture() {
  const state = createFixture(), first = finalizeGame(state, { source: 'manual', winner: 'blue', sourceGameId: '701' })!;
  first.game = 1; first.match.game = 1; first.seriesComplete = false; first.endedAt = '2026-10-22T10:00:00Z'; first.id = 'g1'; first.key = 'key1';
  const second = structuredClone(first); second.id = 'g2'; second.key = 'key2'; second.game = 2; second.match.game = 2; second.sourceGameId = '702'; second.endedAt = '2026-10-22T11:00:00Z';
  [second.blueTeamId, second.redTeamId] = [first.redTeamId, first.blueTeamId];
  second.match.blueTeamId = second.blueTeamId; second.match.redTeamId = second.redTeamId;
  second.winner = 'red'; second.winnerTeamId = second.redTeamId;
  second.snapshot.players.forEach(p => { p.team = p.team === 'blue' ? 'red' : 'blue'; });
  [second.draft.bluePicks, second.draft.redPicks] = [second.draft.redPicks, second.draft.bluePicks];
  state.gameResults = [first, second]; state.draftHistory = [];
  return { state, first, second };
}
test('archive series follows team identity across side swaps and filters invalid, duplicate and later games', () => {
  const { state, first, second } = fixture();
  const later: GameResult = { ...structuredClone(second), id: 'g3', key: 'key3', game: 3, sourceGameId: '703' };
  const invalid: GameResult = { ...structuredClone(first), id: 'invalid', key: 'bad', game: 4, sourceGameId: '704' };
  invalid.snapshot.result!.valid = false;
  state.gameResults!.push(later, invalid, { ...structuredClone(first), id: 'duplicate' });
  assert.equal(graphicArchives(state).length, 3);
  assert.deepEqual(archiveSeries(state, second).map(r => r.game), [1, 2]);
  assert.equal(archiveWinner(second), first.blueTeamId);
  assert.equal(archiveWinner({ ...second, winner: null, winnerTeamId: undefined }), null);
});
test('team totals require complete valid rosters and archive damage preserves missing observations', () => {
  const { state, first } = fixture();
  first.snapshot.players.forEach(p => { p.telemetryDamage = { toChampions: 1000 }; p.telemetryDamageSource = 'postgame'; p.visionScore = 5; });
  assert.equal(archiveMetrics(state, first).find(r => r.id === 'damage')!.blue, 5000);
  first.snapshot.players[0].telemetryDamage = undefined;
  assert.equal(archiveMetrics(state, first).find(r => r.id === 'damage')!.blue, null);
  assert.equal(archiveDamage(first).at(-1)!.damage, null);
  first.snapshot.players[0].statsAvailable = false;
  assert.equal(archiveMetrics(state, first).find(r => r.id === 'kills')!.blue, null);
  first.snapshot.players.pop();
  assert.equal(archiveMetrics(state, first).find(r => r.id === 'vision')!.red, null);
});
test('Fearless separates rules, team scope, lane identity and exception games without assigning pick order to roles', () => {
  const { state, first, second } = fixture();
  first.snapshot.players[0].role = ''; state.production!.rules = { mode: 'fearless', scope: 'team', exceptionGames: [], remakeHistory: 'retain' };
  let model = archiveFearless(state, second);
  assert.equal(model.active, true); assert.equal(model.nextGame, 3);
  assert.equal(model.history.find(p => p.game === 1 && p.championId === first.snapshot.players[0].championId)!.role, '未确认分路');
  assert(model.restricted(first.blueTeamId).includes(first.snapshot.players[0].championId));
  assert(!model.restricted(first.redTeamId).includes(first.snapshot.players[0].championId));
  state.production!.rules.scope = 'all'; model = archiveFearless(state, second);
  assert(model.restricted(first.redTeamId).includes(first.snapshot.players[0].championId));
  state.production!.rules.exceptionGames = [3]; assert.equal(archiveFearless(state, second).active, false);
  state.match.seriesId = 'unrelated'; assert.equal(archiveFearless(state, second).active, null);
  second.seriesComplete = true; assert.equal(archiveFearless(state, second).active, false); assert.match(archiveFearless(state, second).reason, /已结束/);
  assert.equal(archiveRole('UTILITY'), '辅助'); assert.equal(archiveRole('MID'), '中路');
});
test('item timeline consumes timestamped raw events, keeps undo facts and rejects foreign or missing timelines', () => {
  const { first } = fixture();
  const buy = { type: 'ITEM_PURCHASED', timestamp: 60000, participantId: 3, itemId: 1001 };
  const raw = { gameId: '701', frames: [{ events: [buy, buy, { type: 'ITEM_UNDO', timestamp: 61000, participantId: 3, beforeId: 1001, afterId: 0 }, { ...buy, participantId: 11 }, { ...buy, timestamp: (first.snapshot.duration + 100) * 1000 }, { ...buy, itemId: -1 }] }] };
  assert.deepEqual(archiveItemEvents(raw, first), [{ time: 60, participantId: 3, type: 'ITEM_PURCHASED', itemId: 1001 }, { time: 60, participantId: 3, type: 'ITEM_PURCHASED', itemId: 1001 }, { time: 61, participantId: 3, type: 'ITEM_UNDO', beforeId: 1001, afterId: 0 }]);
  assert.equal(archiveItemEvents({ ...raw, gameId: '999' }, first), null);
  assert.equal(archiveItemEvents(undefined, first), null);
  assert.deepEqual(archiveItemEvents({ frames: [{ events: [] }] }, first), []);
});
test('item identities join explicit participant IDs, preserve unknowns and reject ambiguous or foreign details', () => {
  const { first } = fixture(), champions = bundledChampions(), hero = champions[0];
  const raw = { gameId: '701', participants: [{ participantId: 3, championId: hero.key, teamId: 100 }, { participantId: 8, championId: -1, teamId: 200 }], participantIdentities: [{ participantId: 8, player: { summonerName: 'RedPlayer' } }, { participantId: 3, player: { summonerName: 'BluePlayer' } }] };
  assert.deepEqual(archiveItemParticipants(raw, first, champions), { 3: { participantId: 3, championId: hero.id, name: 'BluePlayer' }, 8: { participantId: 8, name: 'RedPlayer' } });
  assert.deepEqual(archiveItemParticipants({ ...raw, gameId: '702' }, first, champions), {});
  assert.deepEqual(archiveItemParticipants(undefined, first, champions), {});
  raw.participants.push({ ...raw.participants[0] });
  assert.equal(archiveItemParticipants(raw, first, champions)[3], undefined);
  assert.equal(archiveItemParticipants({ gameId: '701', participants: [{ championId: hero.key }] }, first, champions)[1], undefined);
});
