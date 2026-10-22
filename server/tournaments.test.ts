import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceTournaments, buildTournament, tournamentStandings, winTarget } from '../shared/tournaments';
import type { TournamentConfig, TournamentFormat } from '../shared/tournament-types';
import { applyAction, createSeed, normalizeSavedState } from './state';
import type { BroadcastState } from '../shared/types';
import { finalizeGame, acceptNextGameSample } from './game-results';
import { createFixture } from './test-support/fixture';

function fixture(format: TournamentFormat, n: number, overrides: Partial<TournamentConfig> = {}) {
  const s = createSeed();
  s.teams = Array.from({ length: n }, (_, i) => ({ id: `team-${i}`, name: `队伍 ${i}`, tag: `T${i}`, color: '#123456', players: [] }));
  s.match.blueTeamId = s.teams[0].id; s.match.redTeamId = s.teams[1].id;
  const config: TournamentConfig = { name: '完整赛事', format, teamIds: s.teams.map(t => t.id), bestOf: 'BO3', finalBestOf: 'BO5', startAt: '2026-10-22T10:00:00+08:00', intervalMinutes: 90, legs: 1, groupCount: 2, advancePerGroup: 2, swissRounds: Math.min(n - 1, 5), grandFinalReset: true, ...overrides };
  return applyAction(s, { type: 'create-tournament', config });
}
function play(s: BroadcastState, id: string, redWins = false) {
  const m = s.schedule.find(m => m.id === id)!;
  return applyAction(s, { type: 'set-tournament-result', matchId: id, blueScore: redWins ? 0 : winTarget(m.format), redScore: redWins ? winTarget(m.format) : 0, reason: '赛果核对' });
}
for (const format of ['single-elimination', 'double-elimination', 'round-robin', 'groups-knockout', 'swiss'] as const) {
  test(`${format}: complete tournaments with odd counts and byes survive reload, no self matches`, () => {
    for (const n of [2, 3, 4, 5, 7, 8, 13, 16, 31, 64]) {
      if (format === 'groups-knockout' && n < 4) continue;
      let s = fixture(format, n, { advancePerGroup: 1 });
      const expected = s.schedule.length;
      let played = 0;
      while (s.tournaments![0].status !== 'finished') {
        const ready = s.schedule.find(m => m.tournament!.state === 'ready' && m.status !== 'finished');
        assert.ok(ready, `${format}/${n}: no ready match at ${played}`);
        assert.notEqual(ready.blueTeamId, ready.redTeamId);
        s = play(s, ready.id, played++ % 3 === 0);
        assert.ok(played <= expected);
      }
      assert.ok(s.tournaments![0].championTeamId);
      const restored = normalizeSavedState(JSON.parse(JSON.stringify(s)));
      assert.deepEqual(restored.tournaments, s.tournaments);
      assert.deepEqual(restored.schedule, s.schedule);
      assert.equal(advanceTournaments(restored), false);
      if (format === 'single-elimination') assert.equal(played, n - 1);
      if (format === 'double-elimination') assert.ok(played === n * 2 - 2 || played === n * 2 - 1, `double ${n}: ${played}`);
      if (format === 'round-robin') assert.equal(played, n * (n - 1) / 2);
    }
  });
}
test('double round robin meets each opponent on both sides exactly once', () => {
  const s = fixture('round-robin', 7, { legs: 2 });
  assert.equal(s.schedule.length, 42);
  assert.equal(new Set(s.schedule.map(m => `${m.blueTeamId}/${m.redTeamId}`)).size, 42);
});
test('grand final reset is enabled only after the lower finalist wins', () => {
  for (const loses of [true, false]) {
    let s = fixture('double-elimination', 2);
    s = play(s, s.schedule[0].id);
    s = play(s, s.schedule[1].id, loses);
    assert.equal(s.schedule[2].tournament!.state, loses ? 'ready' : 'skipped');
  }
});
test('Swiss byes rotate and all pairings use unique teams; balanced rounds avoid rematches', () => {
  let s = fixture('swiss', 8, { swissRounds: 5 });
  const pairs = new Set<string>();
  for (let round = 1; round <= 5; round++) {
    const rows = s.schedule.filter(m => m.tournament!.round === round);
    assert.equal(new Set(rows.flatMap(m => [m.blueTeamId, m.redTeamId])).size, 8);
    for (const m of rows) {
      const key = [m.blueTeamId, m.redTeamId].sort().join('/');
      assert.ok(!pairs.has(key)); pairs.add(key); s = play(s, m.id);
    }
  }
  let odd = fixture('swiss', 7, { swissRounds: 6 });
  while (odd.tournaments![0].status !== 'finished') { const m = odd.schedule.find(m => m.tournament!.state === 'ready')!; odd = play(odd, m.id); }
  const byes = tournamentStandings(odd.tournaments![0], odd.schedule).map(r => r.byes);
  assert.equal(Math.max(...byes), 1); assert.equal(byes.reduce((a, b) => a + b), 6);
});
test('correction updates unplayed descendants and blocks changes to played descendants atomically', () => {
  let s = fixture('single-elimination', 4);
  s = play(s, s.schedule[0].id); s = play(s, s.schedule[1].id);
  const winner = s.schedule[2].blueTeamId;
  s = play(s, s.schedule[0].id, true);
  assert.notEqual(s.schedule[2].blueTeamId, winner);
  s = play(s, s.schedule[2].id);
  const before = JSON.stringify(s);
  assert.throws(() => play(s, s.schedule[0].id), /前序修订/);
  assert.equal(JSON.stringify(s), before);
});
test('legacy schedule editor cannot remove or forge generated matches; placeholders block load', () => {
  const s = fixture('single-elimination', 4);
  assert.throws(() => applyAction(s, { type: 'set-schedule', schedule: [] }), /整届赛事/);
  assert.throws(() => applyAction(s, { type: 'load-match', matchId: s.schedule[2].id }), /等待前序/);
  assert.deepEqual(applyAction(s, { type: 'set-schedule', schedule: s.schedule }).schedule, s.schedule);
});
test('batch teams and tournament creation are atomic and keep the previous programme', () => {
  const s = createSeed(), config = fixture('single-elimination', 4).tournaments![0].config;
  const next = applyAction(s, { type: 'create-tournament', config: { ...config, teamIds: [] }, newTeamNames: ['A', 'B', 'C'] });
  assert.equal(next.teams.length, 5); assert.equal(next.schedule.length, 3);
  assert.deepEqual(next.production!.program, s.production!.program);
  assert.throws(() => buildTournament('x', { ...config, teamIds: ['missing'] }, s.teams));
  assert.equal(s.schedule.length, 0);
});
test('automatically archived BO games advance the event and loading its next match rejects the old terminal frame', () => {
  let s = fixture('single-elimination', 4, { bestOf: 'BO1', finalBestOf: 'BO1' });
  s = applyAction(s, { type: 'load-match', matchId: s.schedule[0].id });
  const observed = createFixture();
  s.players = observed.players; s.players.forEach(p => { p.statsSource = 'api'; p.statsGameTime = 1800; });
  s.gameTime = 1800; s.events = [];
  const r = finalizeGame(s, { source: 'live', sourceGameId: 'event-game-1', winner: 'red', terminal: true })!;
  assert.equal(r.tournamentId, s.tournaments![0].id); assert.equal(s.schedule[2].blueTeamId, s.schedule[0].redTeamId);
  const next = applyAction(s, { type: 'load-match', matchId: s.schedule[1].id });
  assert.ok(next.awaitingNextGame);
  assert.equal(acceptNextGameSample(next, { players: r.snapshot.players, gameTime: 1800, ended: true, sourceGameId: r.sourceGameId }), false);
  assert.equal(acceptNextGameSample(next, { players: r.snapshot.players, gameTime: 0, ended: false, sourceGameId: 'event-game-2' }), true);
  assert.equal(next.gameResults!.length, 1);
});
