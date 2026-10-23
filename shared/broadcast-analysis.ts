import type { BroadcastState, GameEvent, Player, Side } from './types';
import { liveDamage } from './combat-display';
import { rankingGold } from './gold-ranking';
import { telemetryFresh } from './player-telemetry';
import { productionKey } from './production';

export const analysisModes = ['off', 'gold-efficiency', 'participation', 'damage', 'damage-composition', 'experience', 'teamfight-timeline', 'skin-display'] as const;
export type BroadcastAnalysisMode = typeof analysisModes[number];
export const analysisLabels: Record<BroadcastAnalysisMode, string> = {
  off: '收起分析', 'gold-efficiency': '经济效率', participation: '参团率', damage: '全场英雄伤害', 'damage-composition': '英雄伤害构成', experience: '等级与经验', 'teamfight-timeline': '团战时间线', 'skin-display': '选手皮肤展示',
};
export interface DamageComposition { physical: number; magic: number; true: number }
export interface AnalysisRow { player: Player; value: number | null; secondary?: number | null; composition?: DamageComposition | null }
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function liveAnalysisReady(state: BroadcastState, now = Date.now()): boolean {
  const age = now - Date.parse(state.connections.live.updatedAt ?? '');
  return state.connections.live.status === 'connected' && !state.gameClock?.awaitingLiveSample &&
    state.phase === 'live' && Number.isFinite(age) && age >= -1000 && age <= 10000;
}
function statsReady(state: BroadcastState, p: Player, now: number) {
  if (!liveAnalysisReady(state, now) || p.statsAvailable === false || ![p.kills, p.deaths, p.assists, p.cs].every(nonnegative)) return false;
  if (p.statsExpiresAt && Date.parse(p.statsExpiresAt) <= now) return false;
  if (p.statsGameTime !== undefined && Math.abs(p.statsGameTime - state.gameTime) > 2) return false;
  return true;
}
export function analysisRows(state: BroadcastState, mode: BroadcastAnalysisMode, now = Date.now()): AnalysisRow[] {
  const ready = liveAnalysisReady(state, now);
  return state.players.slice(0, 10).map(player => {
    let value: number | null = null, secondary: number | null | undefined, composition: DamageComposition | null | undefined;
    const damage = ready ? liveDamage(player, state, now) : undefined;
    if (mode === 'damage') value = damage ?? null;
    if (mode === 'damage-composition') {
      const types = player.telemetryDamage;
      composition = ready && player.telemetryDamageSource !== 'postgame' && telemetryFresh(player.telemetry, state.gameTime, now) &&
        nonnegative(types?.physicalToChampions) && nonnegative(types?.magicToChampions) && nonnegative(types?.trueToChampions)
        ? { physical: types.physicalToChampions, magic: types.magicToChampions, true: types.trueToChampions } : null;
      value = composition ? composition.physical + composition.magic + composition.true : null;
    }
    if (mode === 'gold-efficiency') {
      const gold = ready ? rankingGold(state, player, now) : null;
      const spent = gold !== null && nonnegative(player.currentGold) && gold >= player.currentGold ? gold - player.currentGold : null;
      value = damage !== undefined && spent !== null && spent > 0 ? damage / spent * 1000 : null;
      secondary = spent;
    }
    if (mode === 'participation') {
      const roster = state.players.filter(p => p.team === player.team);
      if (roster.length === 5 && roster.every(p => statsReady(state, p, now))) {
        const kills = roster.reduce((sum, p) => sum + p.kills, 0);
        value = kills > 0 ? Math.min(100, (player.kills + player.assists) / kills * 100) : 0;
      }
    }
    if (mode === 'experience') {
      const fresh = ready && telemetryFresh(player.telemetry, state.gameTime, now);
      value = fresh && nonnegative(player.level) && player.level >= 1 && player.level <= 18 ? player.level : null;
      secondary = fresh && nonnegative(player.experience) && nonnegative(player.maxExperience) && player.maxExperience > 0 ? Math.min(100, player.experience / player.maxExperience * 100) : null;
    }
    return { player, value, ...(secondary !== undefined ? { secondary } : {}), ...(composition !== undefined ? { composition } : {}) };
  });
}

/** Keep structured source fields so widgets never parse display text as game facts. */
export function broadcastEventFields(raw: Record<string, unknown>): Partial<GameEvent> {
  const fields: Partial<GameEvent> = {};
  const text = (value: unknown) => typeof value === 'string' && value.length <= 300 ? value : undefined;
  fields.actor = text(raw.KillerName) ?? text(raw.Recipient);
  fields.victim = text(raw.VictimName);
  // Riot Live Client Events uses Assisters; absence remains unknown, [] is explicit no assists.
  if (Array.isArray(raw.Assisters) && raw.Assisters.length <= 10 && raw.Assisters.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 300)) {
    fields.assistants = [...new Set(raw.Assisters as string[])].filter(value => value !== fields.actor && value !== fields.victim);
  }
  fields.objective = text(raw.InhibKilled) ?? text(raw.InhibRespawned) ?? text(raw.InhibRespawningSoon) ?? text(raw.TurretKilled) ?? text(raw.DragonType);
  if (Number.isInteger(raw.KillStreak) && nonnegative(raw.KillStreak)) fields.streak = raw.KillStreak;
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}
export function currentEvents(state: BroadcastState, now = Date.now()): GameEvent[] {
  if (!liveAnalysisReady(state, now)) return [];
  const seen = new Set<string>();
  return state.events.filter(e => {
    if (!nonnegative(e.time) || e.time > state.gameTime + .05 || seen.has(e.id)) return false;
    seen.add(e.id); return true;
  }).sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}
export function killFeedEvents(state: BroadcastState, now = Date.now()): GameEvent[] {
  return currentEvents(state, now).filter(e => e.type === 'ChampionKill' && state.gameTime - e.time <= 12).slice(-4).reverse();
}
/** Counts only observed kills with an explicitly supplied assist list and unambiguous participant identities. */
export function bestPartners(state: BroadcastState, now = Date.now()) {
  const pairs = new Map<string, { first: Player; second: Player; kills: number }>();
  let coveredKills = 0, unknownKills = 0;
  const resolve = (name: string) => { const matches = state.players.filter(p => p.name === name || p.id === `live-${name}`); return matches.length === 1 ? matches[0] : undefined; };
  for (const event of currentEvents(state, now).filter(e => e.type === 'ChampionKill')) {
    if (!event.actor || !event.assistants) { unknownKills++; continue; }
    const participants = [...new Set([event.actor, ...event.assistants])].map(resolve);
    if (participants.some(p => !p) || new Set(participants.map(p => p!.id)).size !== participants.length || participants.some(p => p!.team !== participants[0]!.team)) { unknownKills++; continue; }
    coveredKills++;
    const ordered = participants.map(p => p!).sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const key = JSON.stringify([ordered[i].id, ordered[j].id]), pair = pairs.get(key) ?? { first: ordered[i], second: ordered[j], kills: 0 }; pair.kills++; pairs.set(key, pair);
    }
  }
  return { coveredKills, unknownKills, pairs: [...pairs.values()].sort((a, b) => b.kills - a.kills || a.first.id.localeCompare(b.first.id) || a.second.id.localeCompare(b.second.id)) };
}
const announcementNames: Record<string, string> = { FirstBlood: '第一滴血', Ace: '团灭', Multikill: '连续击杀', DragonKill: '巨龙已被击杀', BaronKill: '纳什男爵已被击杀', HeraldKill: '峡谷先锋已被击杀', InhibKilled: '召唤水晶被摧毁', TurretKilled: '防御塔被摧毁' };
export function announcementEvent(state: BroadcastState, now = Date.now()) {
  const event = currentEvents(state, now).filter(e => announcementNames[e.type] && state.gameTime - e.time <= 7).at(-1);
  return event ? { event, title: event.type === 'Multikill' && event.streak ? ({ 2: '双杀', 3: '三杀', 4: '四杀', 5: '五杀' }[event.streak] ?? '连续击杀') : announcementNames[event.type] } : null;
}
export interface InhibitorTimer { key: string; side: Side; lane: 'top' | 'mid' | 'bottom'; destroyedAt: number; dueAt: number; remaining: number }
export function inhibitorTimers(state: BroadcastState, now = Date.now()): InhibitorTimer[] {
  const entries = new Map<string, InhibitorTimer>();
  for (const e of currentEvents(state, now)) {
    if (!['InhibKilled', 'InhibRespawned'].includes(e.type)) continue;
    const match = e.objective?.match(/^Barracks_T([12])_(L1|C1|R1)$/i);
    if (!match) continue;
    const key = e.objective!.toUpperCase();
    if (e.type === 'InhibRespawned') { entries.delete(key); continue; }
    entries.set(key, { key, side: match[1] === '1' ? 'blue' : 'red', lane: match[2].toUpperCase() === 'L1' ? 'top' : match[2].toUpperCase() === 'R1' ? 'bottom' : 'mid', destroyedAt: e.time, dueAt: e.time + 300, remaining: Math.max(0, Math.ceil(e.time + 300 - state.gameTime)) });
  }
  return [...entries.values()].filter(e => e.remaining > 0).sort((a, b) => a.dueAt - b.dueAt);
}
export function teamfightTimeline(state: BroadcastState, now = Date.now()) {
  const segment = state.fightSegment;
  if (!segment || segment.key !== productionKey(state) || !liveAnalysisReady(state, now)) return null;
  const end = Math.min(segment.endedAt ?? state.gameTime, state.gameTime);
  if (end < segment.startedAt || segment.clockSession !== state.gameClock?.sessionId || segment.discontinuity !== state.gameClock?.discontinuity) return null;
  const events = currentEvents(state, now).filter(e => e.time >= segment.startedAt && e.time <= end && ['ChampionKill', 'DragonKill', 'BaronKill', 'HeraldKill', 'TurretKilled', 'InhibKilled'].includes(e.type));
  return { start: segment.startedAt, end, active: segment.active, events, kills: { blue: events.filter(e => e.type === 'ChampionKill' && e.team === 'blue').length, red: events.filter(e => e.type === 'ChampionKill' && e.team === 'red').length } };
}
