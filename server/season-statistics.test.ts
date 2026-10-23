import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonLeaderboard, seasonMetricValue, seasonStatistics } from '../shared/season-statistics';
import { createFixture } from './test-support/fixture';
import { applyIdentity } from '../shared/production';
import type { GameResult } from '../shared/types';

function fixture() {
  const state = createFixture();
  state.gameResults = [];
  const add = (id: string, winner: 'blue' | 'red' | null = 'blue'): GameResult => {
    const r: GameResult = { id, key: id, sourceGameId: id, seriesId: 'series', game: state.gameResults!.length + 1, blueTeamId: state.match.blueTeamId, redTeamId: state.match.redTeamId, winner,
      winnerTeamId: winner ? state.match[`${winner}TeamId`] : undefined, endedAt: `2026-10-22T10:00:00Z`, source: 'manual', seriesComplete: false,
      match: structuredClone(state.match), teams: structuredClone(state.teams), draft: structuredClone(state.draft),
      snapshot: { id, title: '归档局', createdAt: '2026-10-22T10:00:00Z', duration: 1800, sourceGameTime: 1800, mode: 'live', players: structuredClone(state.players), stats: structuredClone(state.stats), events: [], economy: [] } };
    r.snapshot.players.forEach((p, i) => { p.registeredPlayerId = `member-${i}`; p.kills = 2; p.deaths = 1; p.assists = 3; p.cs = 100; p.statsAvailable = true; p.gold = 10000; p.damageDealt = 10000; p.visionScore = 10; });
    state.gameResults!.push(r); return r;
  };
  return { state, add };
}
test('season metrics aggregate valid archives with explicit outcome and missing-data denominators', () => {
  const { state, add } = fixture(); add('one'); const second = add('two', null);
  second.snapshot.players[0].gold = null; second.snapshot.players[0].damageDealt = undefined; second.snapshot.players[0].telemetryDamage = undefined; second.snapshot.players[0].statsAvailable = false;
  const data = seasonStatistics(state), p = data.players.find(p => p.name === state.players[0].name)!;
  assert.equal(data.games, 2); assert.equal(data.resolvedGames, 1); assert.equal(p.games, 2); assert.equal(p.resolvedGames, 1); assert.equal(p.winRate, 1);
  assert.equal(p.goldGames, 1); assert.equal(seasonMetricValue(p, 'gold'), 10000); assert.equal(p.scoreGames, 1); assert.equal(p.kda, 5); assert.equal(p.damageGames, 1); assert.equal(p.damagePerMinute, 10000 / 30);
  assert.equal(p.killParticipation, .5); assert.equal(p.damageShare, .2); assert.equal(p.damageShareGames, 1);
  assert.equal(p.championPool[0].games, 2); assert.equal(p.championPool[0].winRate, 1);
});
test('invalid remakes and duplicate same-game archives do not inflate season totals', () => {
  const { state, add } = fixture(); const good = add('good'); state.gameResults!.push(structuredClone(good));
  const invalid = add('invalid'); state.production!.invalidAttempts.push({ key: invalid.key, at: invalid.endedAt, reason: '重赛', draft: invalid.draft, result: invalid });
  const flagged = add('flagged'); flagged.snapshot.result = { resultId: flagged.id, seriesId: flagged.seriesId, game: 1, attempt: 1, winner: null, version: 1, terminalComplete: false, seriesComplete: false, blueScore: 0, redScore: 0, valid: false };
  const data = seasonStatistics(state); assert.equal(data.games, 1); assert.ok(data.players.every(p => p.games === 1));
});
test('scope includes explicit event ids and schedule-linked archives while rejecting unrelated games', () => {
  const { state, add } = fixture(); add('explicit').tournamentId = 'event'; const linked = add('linked'); linked.matchId = 'event-match';
  state.schedule = [{ id: 'event-match', title: '赛事', blueTeamId: state.match.blueTeamId, redTeamId: state.match.redTeamId, scheduledAt: '', format: 'BO3', status: 'live', blueScore: 1, redScore: 0, tournament: { tournamentId: 'event', stage: 'league', round: 1, order: 0, blue: { kind: 'team', teamId: state.match.blueTeamId }, red: { kind: 'team', teamId: state.match.redTeamId }, state: 'ready' } }];
  add('other').tournamentId = 'elsewhere'; assert.equal(seasonStatistics(state, 'event').games, 2); assert.equal(seasonStatistics(state, 'missing').games, 0);
});
test('head-to-head remains stable through side swaps and separates games from manually completed series', () => {
  const { state, add } = fixture(); add('one', 'blue'); const flipped = add('two', 'red');
  [flipped.blueTeamId, flipped.redTeamId] = [flipped.redTeamId, flipped.blueTeamId]; flipped.winnerTeamId = flipped.redTeamId;
  add('three', null);
  state.schedule = [{ id: 'series', title: 'BO3', blueTeamId: state.match.blueTeamId, redTeamId: state.match.redTeamId, scheduledAt: '', status: 'finished', format: 'BO3', blueScore: 2, redScore: 0 }];
  const h = seasonStatistics(state).headToHead[0]; assert.equal(h.games, 3); assert.equal(h.unresolved, 1); assert.equal(h.matches, 1);
  const blueIsA = h.teamA === state.match.blueTeamId; assert.equal(blueIsA ? h.winsA : h.winsB, 2); assert.equal(blueIsA ? h.matchWinsA : h.matchWinsB, 1);
});
test('champion pick-ban rates count each game once for presence and exclude unknown outcomes from win rate', () => {
  const { state, add } = fixture(); const first = add('one'); const id = first.draft.bluePicks[0]; first.draft.blueBans = [id, 'TestBan', 'Ban2', 'Ban3', 'Ban4']; first.draft.redBans = ['TestBan', 'Ban5', 'Ban6', 'Ban7', 'Ban8'];
  add('two', null); const data = seasonStatistics(state), c = data.champions.find(c => c.id === id)!;
  assert.equal(c.picks, 2); assert.equal(c.bans, 1); assert.equal(c.presence, 2); assert.equal(c.presenceRate, 1); assert.equal(c.winRate, 1); assert.equal(c.resolvedPicks, 1);
  assert.equal(data.champions.find(c => c.id === 'TestBan')!.bans, 1);
});
test('missing or partial damage and zero-kill games remain unavailable in share and ranking', () => {
  const { state, add } = fixture(); const r = add('zero');
  for (const p of r.snapshot.players) { p.kills = 0; p.assists = 0; p.damageDealt = undefined; p.telemetryDamage = undefined; p.visionScore = undefined; }
  const data = seasonStatistics(state); assert.ok(data.players.every(p => p.killParticipation === null && p.damageShare === null && p.damagePerMinute === null));
  assert.equal(seasonLeaderboard(data, 'damage').length, 0); assert.equal(seasonLeaderboard(data, 'vision').length, 0); assert.equal(seasonLeaderboard(data, 'games', 2).length, 0);
  assert.equal(seasonLeaderboard(data, 'kda').length, 10);
});
test('incomplete drafts and duplicate player identities are excluded from dependent denominators', () => {
  const { state, add } = fixture(); const good = add('complete'); const partial = add('partial');
  partial.draft.bluePicks = ['Aatrox']; partial.draft.blueBans = []; partial.draft.redBans = []; partial.draft.locked = false;
  partial.snapshot.players[4] = structuredClone(partial.snapshot.players[0]);
  const data = seasonStatistics(state), p = data.players.find(p => p.name === state.players[0].name)!;
  assert.deepEqual(data.draftCoverage, { picks: 1, bans: 1, complete: 1 });
  const c = data.champions.find(c => c.id === good.draft.bluePicks[0])!;
  assert.equal(c.picks, 1); assert.equal(c.pickRate, 1); assert.equal(c.presenceRate, 1);
  assert.equal(p.games, 2); assert.equal(p.contributionGames, 1); assert.equal(p.damageShareGames, 1);
  partial.draft.bluePicks = []; good.draft.bluePicks = ['Aatrox'];
  const unknown = seasonStatistics(state).champions.find(c => c.id === 'Aatrox')!;
  assert.equal(unknown.pickRate, null); assert.equal(unknown.presenceRate, null);
});
test('damage per minute weights available game durations and excludes a missing duration', () => {
  const { state, add } = fixture(); add('thirty'); const short = add('ten'); short.snapshot.sourceGameTime = 600; short.snapshot.players[0].damageDealt = 20000;
  const unknown = add('unknown'); unknown.snapshot.sourceGameTime = 0; unknown.snapshot.players[0].damageDealt = 90000;
  const p = seasonStatistics(state).players.find(p => p.name === state.players[0].name)!;
  assert.equal(p.damageGames, 3); assert.equal(seasonMetricValue(p, 'damage'), 40000); assert.equal(p.damagePerMinute, 750);
});

test('matched roster identity keeps renamed players in one season row and rejects ambiguous accounts', () => {
  const { state, add } = fixture();
  const member = state.teams.find(t => t.id === state.match.blueTeamId)!.players[0];
  member.account = 'StableAccount#CN';
  const observed = { ...state.players[0], id: 'live-StableAccount#CN', name: 'StableAccount#CN' };
  const first = add('old-name'); first.snapshot.players[0] = applyIdentity(state, [observed])[0];
  assert.equal(first.snapshot.players[0].registeredPlayerId, member.id);
  member.name = '新显示名称';
  const second = add('new-name'); second.snapshot.players[0] = applyIdentity(state, [observed])[0];
  const data = seasonStatistics(state), rows = data.players.filter(p => p.id === JSON.stringify([state.match.blueTeamId, member.id]));
  assert.equal(rows.length, 1); assert.equal(rows[0].games, 2); assert.equal(rows[0].name, '新显示名称');
  state.teams.find(t => t.id === state.match.blueTeamId)!.players[1].account = member.account;
  assert.equal(applyIdentity(state, [observed])[0].registeredPlayerId, undefined);
  assert.equal(applyIdentity(state, [{ ...observed, team: 'red' }])[0].registeredPlayerId, undefined);
});
