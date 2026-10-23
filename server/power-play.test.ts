import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './test-support/fixture';
import { powerPlayRows, syncPowerPlay, type PowerPlayState } from '../shared/power-play';
const now = Date.parse('2026-10-22T12:00:00Z');
function fixture() {
  const s = createFixture() as ReturnType<typeof createFixture> & { powerPlay?: PowerPlayState };
  s.phase = 'live'; s.gameTime = 99; s.events = []; s.connections.live = { status: 'connected', updatedAt: new Date(now).toISOString(), detail: '' };
  s.gameClock = { source: 'live', gameTime: 99, sampledAt: new Date(now).toISOString(), speed: 1, paused: false, sessionId: 'one', discontinuity: 0, matchKey: 'game', validForMs: 3000 };
  s.players.forEach(p => { p.gold = 5000; p.goldGameTime = 99; p.goldSource = 'api'; p.goldSampledAt = new Date(now).toISOString(); p.isDead = false; p.telemetry = { gameTime: 99, sampledAt: new Date(now).toISOString(), validForMs: 3000, source: 'api' }; p.buffs = { baron: false, elder: false }; });
  return s;
}
function advance(s: ReturnType<typeof fixture>, t: number, blue: number, red: number, buff = true) {
  s.gameTime = t; s.players.forEach(p => { p.gold = p.team === 'blue' ? blue : red; p.goldGameTime = t; p.telemetry!.gameTime = t; p.buffs!.baron = p.team === 'blue' && buff; });
}
test('power play persists an event-anchored pre-kill baseline and displays net team gold differential', () => {
  const s = fixture(); syncPowerPlay(s, now); advance(s, 100, 5200, 5050); s.events = [{ id: 'baron', time: 100, type: 'BaronKill', team: 'blue', text: '' }]; syncPowerPlay(s, now);
  assert.equal(powerPlayRows(s, now)[0].value, 750); assert.equal(s.powerPlay!.intervals[0].baseline!.time, 99);
  const saved = JSON.parse(JSON.stringify(s)); advance(saved, 101, 5400, 5100); syncPowerPlay(saved, now); assert.equal(powerPlayRows(saved, now)[0].value, 1500);
  advance(saved, 102, 5500, 5200, false); syncPowerPlay(saved, now); assert.deepEqual(powerPlayRows(saved, now), []); assert.equal(saved.powerPlay!.intervals[0].endedAt, 102);
});
test('power play keeps missing baseline, gold and buff coverage unknown instead of producing partial profit', () => {
  const noStart = fixture(); advance(noStart, 100, 5200, 5000); noStart.events = [{ id: 'baron', time: 100, type: 'BaronKill', team: 'blue', text: '' }]; syncPowerPlay(noStart, now); assert.equal(powerPlayRows(noStart, now)[0].value, null);
  const s = fixture(); syncPowerPlay(s, now); advance(s, 100, 5200, 5000); s.events = noStart.events; syncPowerPlay(s, now); s.players[0].gold = null; advance(s, 101, 5300, 5050); s.players[0].gold = null; syncPowerPlay(s, now); assert.equal(powerPlayRows(s, now)[0].value, null);
  advance(s, 102, 5400, 5100); syncPowerPlay(s, now); assert.equal(powerPlayRows(s, now)[0].value, null, 'a later sample does not erase the recorded data gap');
  const b = fixture(); syncPowerPlay(b, now); advance(b, 100, 5200, 5000); b.events = noStart.events; b.players[0].telemetry = undefined; syncPowerPlay(b, now); assert.equal(powerPlayRows(b, now)[0].value, null);
});
test('power play clears on seeks and new games and rejects stale samples and gold regressions', () => {
  const s = fixture(); syncPowerPlay(s, now); advance(s, 100, 5200, 5000); s.events = [{ id: 'baron', time: 100, type: 'BaronKill', team: 'blue', text: '' }]; syncPowerPlay(s, now);
  assert.deepEqual(powerPlayRows(s, now + 20000), []);
  advance(s, 101, 4900, 5050); syncPowerPlay(s, now); assert.equal(powerPlayRows(s, now)[0].value, null);
  s.gameClock!.discontinuity++; s.events = []; syncPowerPlay(s, now); assert.equal(s.powerPlay!.intervals.length, 0);
  s.match.game++; syncPowerPlay(s, now); assert.equal(s.powerPlay!.recent.length, 1);
});

test('power play rejects gold regression above its baseline and clears unavailable expiry', () => {
  const s = fixture(); syncPowerPlay(s, now); advance(s, 100, 5200, 5000); s.events = [{ id: 'baron', time: 100, type: 'BaronKill', team: 'blue', text: '' }];
  s.players.filter(p => p.team === 'blue').forEach(p => { p.buffs!.baronExpiresAt = 280; }); syncPowerPlay(s, now);
  assert.equal(powerPlayRows(s, now)[0].expiresAt, 280);
  advance(s, 101, 5400, 5050); s.players.filter(p => p.team === 'blue').forEach(p => { delete p.buffs!.baronExpiresAt; }); syncPowerPlay(s, now);
  assert.equal(powerPlayRows(s, now)[0].expiresAt, undefined);
  advance(s, 102, 5300, 5100); syncPowerPlay(s, now);
  assert.equal(powerPlayRows(s, now)[0].value, null); assert.equal(s.powerPlay!.intervals[0].reason, '累计金币发生回退');
});
