import type { BroadcastState, Side } from './types';
import { productionKey } from './production';
import { rankingGold } from './gold-ranking';
import { telemetryFresh } from './player-telemetry';

export interface PowerPlaySample { time: number; blue: number | null; red: number | null }
export interface PowerPlayInterval {
  id: string; side: Side; kind: 'baron' | 'elder'; startedAt: number; endedAt?: number; expiresAt?: number;
  baseline?: PowerPlaySample; samples: PowerPlaySample[]; complete: boolean; reason?: string; active: boolean;
}
export interface PowerPlayState { key: string; clockSession?: string; discontinuity?: number; lastTime: number; recent: PowerPlaySample[]; intervals: PowerPlayInterval[] }
type PowerState = BroadcastState & { powerPlay?: PowerPlayState };
const number = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function ready(state: BroadcastState, now: number) {
  const age = now - Date.parse(state.connections.live.updatedAt ?? '');
  return state.phase === 'live' && state.connections.live.status === 'connected' && !state.gameClock?.awaitingLiveSample && age >= -1000 && age <= 10000;
}
function goldSample(state: BroadcastState, now: number): PowerPlaySample {
  const sum = (side: Side) => {
    const players = state.players.filter(p => p.team === side), values = players.map(p => rankingGold(state, p, now));
    return ready(state, now) && players.length === 5 && values.every(number) && players.every(p => number(p.goldGameTime) && Math.abs(p.goldGameTime - state.gameTime) <= 2) ? values.reduce<number>((s, v) => s + v!, 0) : null;
  };
  return { time: state.gameTime, blue: sum('blue'), red: sum('red') };
}
function buffStatus(state: BroadcastState, interval: PowerPlayInterval, now: number) {
  const players = state.players.filter(p => p.team === interval.side);
  const fresh = players.length === 5 && players.every(p => telemetryFresh(p.telemetry, state.gameTime, now) && Math.abs(p.telemetry!.gameTime - state.gameTime) <= 2);
  if (!ready(state, now) || !fresh) return 'unknown';
  const alive = players.filter(p => p.isDead !== true && p.buffs?.[interval.kind] === true && (!number(p.buffs[`${interval.kind}ExpiresAt`]) || p.buffs[`${interval.kind}ExpiresAt`]! > state.gameTime));
  if (alive.length) {
    const expiry = alive.map(p => p.buffs?.[`${interval.kind}ExpiresAt`]).filter(number); if (expiry.length === alive.length) interval.expiresAt = Math.max(...expiry); else delete interval.expiresAt;
    return 'active';
  }
  return players.every(p => p.isDead === true || p.buffs?.[interval.kind] === false || p.buffs?.[interval.kind] === true && number(p.buffs[`${interval.kind}ExpiresAt`]) && p.buffs[`${interval.kind}ExpiresAt`]! <= state.gameTime) ? 'ended' : 'unknown';
}
/** Server-owned samples: exact event identity, pre-event gold, current buff coverage, and seek isolation. */
export function syncPowerPlay(state: PowerState, now = Date.now()): void {
  const key = productionKey(state), clock = state.gameClock;
  let store = state.powerPlay;
  if (!store || store.key !== key || store.clockSession !== clock?.sessionId || store.discontinuity !== clock?.discontinuity || state.gameTime < store.lastTime - .5 || clock?.awaitingLiveSample) {
    store = state.powerPlay = { key, clockSession: clock?.sessionId, discontinuity: clock?.discontinuity, lastTime: state.gameTime, recent: [], intervals: [] };
  }
  const sample = goldSample(state, now), jumped = state.gameTime - store.lastTime > 3;
  for (const event of state.events) {
    const kind = event.type === 'BaronKill' ? 'baron' : event.type === 'DragonKill' && event.objective?.toLowerCase() === 'elder' ? 'elder' : undefined;
    if (!kind || !event.team || !number(event.time) || event.time > state.gameTime || state.gameTime - event.time > 3 || store.intervals.some(i => i.id === event.id) || !ready(state, now)) continue;
    for (const old of store.intervals.filter(i => i.kind === kind && i.active)) { old.active = false; old.endedAt = event.time; }
    const baseline = store.recent.filter(s => s.time < event.time && event.time - s.time <= 2 && number(s.blue) && number(s.red)).at(-1);
    store.intervals.push({ id: event.id, side: event.team, kind, startedAt: event.time, ...(baseline ? { baseline: { ...baseline } } : {}), samples: [], complete: !!baseline, ...(baseline ? {} : { reason: '资源取得前的双队金币未采集' }), active: true });
  }
  for (const interval of store.intervals.filter(i => i.active)) {
    const status = buffStatus(state, interval, now);
    if (jumped || status === 'unknown' || !number(sample.blue) || !number(sample.red)) { interval.complete = false; interval.reason = jumped ? '采样时间出现缺口' : status === 'unknown' ? '增益状态未完整采集' : '双队金币未完整采集'; }
    const previousGold = interval.samples.filter(s => number(s.blue) && number(s.red)).at(-1) ?? interval.baseline;
    if (previousGold && number(sample.blue) && number(sample.red) && (sample.blue < previousGold.blue! || sample.red < previousGold.red!)) { interval.complete = false; interval.reason = '累计金币发生回退'; }
    const last = interval.samples.at(-1);
    if (!last || sample.time - last.time >= .5) interval.samples.push({ ...sample, ...(status === 'unknown' ? { blue: null, red: null } : {}) });
    if (interval.samples.length > 720) interval.samples.shift();
    if (status === 'ended' || state.phase !== 'live') { interval.active = false; interval.endedAt = state.gameTime; }
  }
  if (!store.recent.length || sample.time > store.recent.at(-1)!.time + .05) store.recent.push(sample);
  store.recent = store.recent.filter(s => state.gameTime - s.time <= 5).slice(-30); store.intervals = store.intervals.slice(-20); store.lastTime = state.gameTime;
}
export function powerPlayRows(state: PowerState, now = Date.now()) {
  const store = state.powerPlay;
  if (!store || store.key !== productionKey(state) || store.clockSession !== state.gameClock?.sessionId || store.discontinuity !== state.gameClock?.discontinuity || !ready(state, now)) return [];
  return store.intervals.filter(i => i.active).map(interval => {
    const last = interval.samples.at(-1), baseline = interval.baseline;
    const complete = interval.complete && baseline && last && state.gameTime - last.time <= 2 && number(last.blue) && number(last.red) && buffStatus(state, { ...interval }, now) === 'active';
    const delta = complete ? (last.blue! - baseline.blue!) - (last.red! - baseline.red!) : null;
    return { ...interval, value: delta === null ? null : interval.side === 'blue' ? delta : -delta };
  });
}
