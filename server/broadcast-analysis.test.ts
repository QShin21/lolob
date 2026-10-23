import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed } from './state';
import { analysisRows, bestPartners, announcementEvent, broadcastEventFields, inhibitorTimers, killFeedEvents, teamfightTimeline } from '../shared/broadcast-analysis';
import { syncFightSegment } from '../shared/combat-display';
import type { BroadcastState, Player } from '../shared/types';

const now = Date.parse('2026-10-22T08:00:00Z');
function fixture(): BroadcastState {
  const state = createSeed();
  state.phase = 'live'; state.gameTime = 100; state.programScene = 'teamfight';
  state.connections.live = { status: 'connected', detail: 'fixture', updatedAt: new Date(now).toISOString() };
  state.gameClock = { source: 'live', gameTime: 100, sampledAt: new Date(now).toISOString(), speed: 1, paused: false, sessionId: 'game-a', discontinuity: 0, matchKey: 'fixture', validForMs: 3000 };
  state.players = Array.from({ length: 10 }, (_, i): Player => ({ id: `p${i}`, name: `Player ${i}`, role: '', championId: `Hero${i}`, championName: `Hero${i}`, team: i < 5 ? 'blue' : 'red',
    kills: 1, deaths: 0, assists: 2, cs: 40, statsAvailable: true, statsSource: 'api', statsSampledAt: new Date(now).toISOString(), statsGameTime: 100,
    level: 6, gold: 5000, currentGold: 1000, goldSource: 'api', goldSampledAt: new Date(now).toISOString(),
    items: [], experience: 150, maxExperience: 600, telemetry: { source: 'api', gameTime: 100, sampledAt: new Date(now).toISOString(), validForMs: 3000 },
    telemetryDamage: { toChampions: 8000 }, telemetryDamageSource: 'api', telemetryDamageSession: 'damage-a',
  }));
  return state;
}
function advance(state: BroadcastState, time: number, clock = now) {
  state.gameTime = time;
  state.connections.live.updatedAt = new Date(clock).toISOString();
  for (const p of state.players) { p.statsGameTime = time; p.telemetry = { ...p.telemetry!, gameTime: time, sampledAt: new Date(clock).toISOString() }; }
}

test('gold efficiency uses spent gold and keeps missing, zero-spend and stale telemetry unavailable', () => {
  const s = fixture();
  assert.equal(analysisRows(s, 'gold-efficiency', now)[0].value, 2000);
  s.players[0].currentGold = undefined;
  assert.equal(analysisRows(s, 'gold-efficiency', now)[0].value, null);
  s.players[0].currentGold = 5000;
  assert.equal(analysisRows(s, 'gold-efficiency', now)[0].value, null);
  s.players[0].currentGold = 6000;
  assert.equal(analysisRows(s, 'gold-efficiency', now)[0].value, null);
  s.players[0].currentGold = 1000;
  assert.equal(analysisRows(s, 'gold-efficiency', now + 4000)[0].value, null);
  s.players[0].telemetryDamageSource = 'postgame';
  assert.equal(analysisRows(s, 'gold-efficiency', now)[0].value, null);
});
test('kill participation requires a complete valid team and calculates zero-kill teams explicitly', () => {
  const s = fixture();
  assert.equal(analysisRows(s, 'participation', now)[0].value, 60);
  s.players[1].statsAvailable = false;
  assert.equal(analysisRows(s, 'participation', now)[0].value, null);
  s.players[1].statsAvailable = true;
  s.players.pop();
  assert.equal(analysisRows(s, 'participation', now)[5].value, null);
  for (const p of s.players) { p.kills = 0; p.assists = 0; }
  assert.equal(analysisRows(s, 'participation', now)[0].value, 0);
});
test('experience uses a current telemetry sample and separates level from unknown XP', () => {
  const s = fixture();
  assert.deepEqual([analysisRows(s, 'experience', now)[0].value, analysisRows(s, 'experience', now)[0].secondary], [6, 25]);
  s.players[0].maxExperience = undefined;
  assert.deepEqual([analysisRows(s, 'experience', now)[0].value, analysisRows(s, 'experience', now)[0].secondary], [6, null]);
  s.gameClock!.awaitingLiveSample = true;
  assert.equal(analysisRows(s, 'experience', now)[0].value, null);
});

test('damage composition requires all three fresh components and preserves genuine zero values', () => {
  const s = fixture(), p = s.players[0];
  p.telemetryDamage = { physicalToChampions: 6000, magicToChampions: 1500, trueToChampions: 500 };
  assert.deepEqual(analysisRows(s, 'damage-composition', now)[0].composition, { physical: 6000, magic: 1500, true: 500 });
  assert.equal(analysisRows(s, 'damage-composition', now)[0].value, 8000);
  delete p.telemetryDamage.trueToChampions;
  assert.equal(analysisRows(s, 'damage-composition', now)[0].composition, null);
  assert.equal(analysisRows(s, 'damage-composition', now)[0].value, null);
  p.telemetryDamage = { physicalToChampions: 0, magicToChampions: 0, trueToChampions: 0 };
  assert.equal(analysisRows(s, 'damage-composition', now)[0].value, 0);
  assert.equal(analysisRows(s, 'damage-composition', now + 4000)[0].value, null);
  s.gameClock!.awaitingLiveSample = true;
  assert.equal(analysisRows(s, 'damage-composition', now)[0].value, null);
  s.gameClock!.awaitingLiveSample = false; s.gameTime = 50;
  assert.equal(analysisRows(s, 'damage-composition', now)[0].value, null);
  s.gameTime = 100; p.telemetryDamageSource = 'postgame';
  assert.equal(analysisRows(s, 'damage-composition', now)[0].value, null);
  p.telemetryDamageSource = 'api'; p.telemetryDamage.magicToChampions = -1;
  assert.equal(analysisRows(s, 'damage-composition', now)[0].value, null);
});
test('structured fields preserve inhibitor identity without interpreting translated text', () => {
  assert.deepEqual(broadcastEventFields({ KillerName: 'P', VictimName: 'Q', InhibKilled: 'Barracks_T2_C1', KillStreak: 3 }), { actor: 'P', victim: 'Q', objective: 'Barracks_T2_C1', streak: 3 });
  assert.deepEqual(broadcastEventFields({ KillerName: {}, KillStreak: NaN, InhibKilled: 4 }), {});
});

test('official Assisters remain explicit, unique and separate from missing assistant data', () => {
  assert.deepEqual(broadcastEventFields({ KillerName: 'A', VictimName: 'B', Assisters: ['C', 'D', 'C', 'A', 'B'] }), { actor: 'A', victim: 'B', assistants: ['C', 'D'] });
  assert.deepEqual(broadcastEventFields({ Assisters: [] }), { assistants: [] });
  assert.equal(broadcastEventFields({}).assistants, undefined);
  assert.equal(broadcastEventFields({ Assisters: ['C', 7] }).assistants, undefined);
  assert.equal(broadcastEventFields({ Assisters: [''] }).assistants, undefined);
});
test('inhibitor countdown rebuilds after seeks, deduplicates and clears respawned structures', () => {
  const s = fixture(); s.gameTime = 500;
  const destroyed = { id: 'destroy', time: 400, type: 'InhibKilled', text: 'event', objective: 'Barracks_T2_C1' };
  s.events = [destroyed, destroyed, { id: 'unknown', time: 420, type: 'InhibKilled', text: 'Barracks_T1_L1' }];
  const row = inhibitorTimers(s, now);
  assert.equal(row.length, 1); assert.equal(row[0].side, 'red'); assert.equal(row[0].lane, 'mid'); assert.equal(row[0].remaining, 200);
  s.gameTime = 350; assert.equal(inhibitorTimers(s, now).length, 0);
  s.gameTime = 700; assert.equal(inhibitorTimers(s, now).length, 0);
  s.gameTime = 500; s.events.push({ id: 'respawn', time: 480, type: 'InhibRespawned', text: '', objective: 'Barracks_T2_C1' });
  assert.equal(inhibitorTimers(s, now).length, 0);
  s.events.push({ ...destroyed, id: 'destroy-again', time: 490 });
  assert.equal(inhibitorTimers(s, now)[0].remaining, 290);
  s.connections.live.status = 'disconnected'; assert.equal(inhibitorTimers(s, now).length, 0);
});
test('kill feed and announcements exclude future, expired and duplicate events', () => {
  const s = fixture();
  const kill = { id: 'k', time: 95, type: 'ChampionKill', text: 'kill', team: 'blue' as const };
  s.events = [kill, kill, { ...kill, id: 'future', time: 101 }, { ...kill, id: 'old', time: 20 }, { id: 'multi', time: 99, type: 'Multikill', text: 'multi', streak: 3 }];
  assert.equal(killFeedEvents(s, now).length, 1);
  assert.equal(announcementEvent(s, now)?.title, '三杀');
  s.gameClock!.awaitingLiveSample = true;
  assert.equal(killFeedEvents(s, now).length, 0); assert.equal(announcementEvent(s, now), null);
});
test('teamfight timeline records whole-team damage, holds gaps, and restarts at a coherent seek', () => {
  const s = fixture();
  syncFightSegment(s, now);
  assert.deepEqual(s.fightSegment?.samples, [{ time: 100, blue: 0, red: 0 }]);
  advance(s, 101);
  for (const p of s.players) p.telemetryDamage!.toChampions! += 100;
  syncFightSegment(s, now);
  assert.deepEqual(s.fightSegment?.samples?.at(-1), { time: 101, blue: 500, red: 500 });
  advance(s, 102); s.players[0].telemetry = undefined;
  syncFightSegment(s, now);
  assert.deepEqual(s.fightSegment?.samples?.at(-1), { time: 102, blue: null, red: 500 });
  const before = s.fightSegment!.id;
  s.gameClock!.awaitingLiveSample = true; syncFightSegment(s, now);
  assert.equal(teamfightTimeline(s, now), null);
  s.gameClock!.awaitingLiveSample = false; s.gameClock!.discontinuity++;
  advance(s, 50); for (const p of s.players) { p.telemetry = { source: 'api', gameTime: 50, sampledAt: new Date(now).toISOString(), validForMs: 3000 }; p.telemetryDamage!.toChampions = 1000; }
  syncFightSegment(s, now + 1);
  assert.notEqual(s.fightSegment!.id, before);
  assert.deepEqual(s.fightSegment?.samples, [{ time: 50, blue: 0, red: 0 }]);
  s.programScene = 'live'; syncFightSegment(s, now + 2);
  assert.equal(teamfightTimeline(s, now)?.active, false);
  assert.equal(teamfightTimeline(s, now)?.start, 50);
});

test('best partners counts complete observed participant lists, deduplicates events and omits ambiguous identities', () => {
  const s = fixture();s.events=[{id:'one',time:99,type:'ChampionKill',text:'',actor:'Player 0',assistants:['Player 1','Player 1','Player 2']},{id:'two',time:100,type:'ChampionKill',text:'',actor:'Player 1',assistants:['Player 0']},{id:'missing',time:99,type:'ChampionKill',text:'',actor:'Player 0'}];
  s.events.push({...s.events[0]});const result=bestPartners(s,now);assert.equal(result.coveredKills,2);assert.equal(result.unknownKills,1);assert.equal(result.pairs[0].kills,2);assert.deepEqual(result.pairs[0].first.id,'p0');assert.deepEqual(result.pairs[0].second.id,'p1');
  s.players[9].name='Player 0';assert.equal(bestPartners(s,now).coveredKills,0);
  s.connections.live.status='disconnected';assert.deepEqual(bestPartners(s,now).pairs,[]);
});
