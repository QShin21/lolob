import type { BroadcastState, Champion, GameResult, Player, Side } from './types';
import { frozenGameState } from './game-results';
import { objectiveCount, objectiveKeys, objectiveLabels } from './objective-counts';
import { reportDamage, reportDamageComposition } from './postgame-damage';

export const archiveGraphicModes = ['team', 'damage', 'gold', 'series', 'fearless', 'fearless-tree', 'items'] as const;
export type ArchiveGraphicMode = typeof archiveGraphicModes[number];
export const archiveGraphicLabels: Record<ArchiveGraphicMode, string> = { team: '赛后队伍数据', damage: '赛后英雄伤害', gold: '赛后经济曲线', series: '系列赛逐局结果', fearless: '下一局 Fearless 限制', 'fearless-tree': '系列赛英雄历史', items: '装备购买时间线' };
export const archiveRoles = ['上路', '打野', '中路', '下路', '辅助', '未确认分路'] as const;
export type ArchiveRole = typeof archiveRoles[number];
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const pair = (r: GameResult) => [r.blueTeamId, r.redTeamId].sort().join('\0');

/** Valid saved games only; remakes and duplicate terminal snapshots cannot inflate a series. */
export function graphicArchives(state: BroadcastState): GameResult[] {
  const invalidIds = new Set(state.production?.invalidAttempts.flatMap(a => a.result ? [a.result.id] : []) ?? []);
  const invalidKeys = new Set(state.production?.invalidAttempts.map(a => a.key) ?? []);
  const chosen = new Map<string, GameResult>(), sourceIds = new Set<string>();
  for (const r of [...(state.gameResults ?? [])].sort((a, b) => b.endedAt.localeCompare(a.endedAt))) {
    if (r.snapshot.result?.valid === false || invalidIds.has(r.id) || invalidKeys.has(r.key)) continue;
    if (r.sourceGameId && sourceIds.has(r.sourceGameId)) continue;
    const key = JSON.stringify([r.seriesId, pair(r), r.game]);
    if (chosen.has(key)) continue;
    chosen.set(key, r); if (r.sourceGameId) sourceIds.add(r.sourceGameId);
  }
  return [...chosen.values()].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}
export function archiveSeries(state: BroadcastState, result: GameResult): GameResult[] {
  return graphicArchives(state).filter(r => r.seriesId === result.seriesId && pair(r) === pair(result) && r.game <= result.game).sort((a, b) => a.game - b.game);
}
export function archiveWinner(result: GameResult): string | null {
  if (result.winnerTeamId === result.blueTeamId || result.winnerTeamId === result.redTeamId) return result.winnerTeamId;
  return result.winner ? result[`${result.winner}TeamId`] : null;
}
export function archiveRole(value: string): ArchiveRole {
  return ({ TOP: '上路', JUNGLE: '打野', MIDDLE: '中路', MID: '中路', BOTTOM: '下路', ADC: '下路', UTILITY: '辅助', SUPPORT: '辅助', 上单: '上路', 打野: '打野', 中单: '中路', 射手: '下路', 辅助: '辅助', 上路: '上路', 中路: '中路', 下路: '下路' } as Record<string, ArchiveRole>)[value.toUpperCase()] ?? '未确认分路';
}
export function archiveMetrics(state: BroadcastState, result: GameResult) {
  const view = frozenGameState(state, result), roster = (side: Side) => view.players.filter(p => p.team === side);
  const sum = (side: Side, get: (p: Player) => number | undefined | null) => { const rows = roster(side), values = rows.map(get); return rows.length === 5 && values.every(valid) ? values.reduce<number>((a, v) => a + v!, 0) : null; };
  const scores = (p: Player, key: 'kills' | 'deaths' | 'assists' | 'cs') => p.statsAvailable === false ? undefined : p[key];
  const rows: { id: string; label: string; blue: number | null; red: number | null }[] = [];
  for (const [id, label] of [['kills', '击杀'], ['deaths', '死亡'], ['assists', '助攻'], ['cs', '补刀']] as const) rows.push({ id, label, blue: sum('blue', p => scores(p, id)), red: sum('red', p => scores(p, id)) });
  for (const [id, label, get] of [['gold', '累计金币', (p: Player) => p.gold], ['damage', '英雄伤害', (p: Player) => reportDamage(p, 'damageDealt')], ['vision', '视野得分', (p: Player) => p.visionScore]] as const) rows.push({ id, label, blue: sum('blue', get), red: sum('red', get) });
  for (const id of objectiveKeys) rows.push({ id, label: objectiveLabels[id], blue: objectiveCount(view, 'blue', id) ?? null, red: objectiveCount(view, 'red', id) ?? null });
  return rows;
}
export function archiveDamage(result: GameResult) {
  return result.snapshot.players.slice(0, 10).map(player => ({ player, damage: reportDamage(player, 'damageDealt') ?? null, composition: reportDamageComposition(player) })).sort((a, b) => (b.damage ?? -1) - (a.damage ?? -1));
}
export interface FearlessPick { game: number; teamId: string; championId: string; role: ArchiveRole; playerName?: string; retainedRemake?: boolean }
export function archiveFearless(state: BroadcastState, result: GameResult) {
  const series = archiveSeries(state, result), history: FearlessPick[] = [];
  for (const game of series) for (const side of ['blue', 'red'] as const) {
    const roster = game.snapshot.players.filter(p => p.team === side), used = new Set<string>();
    for (const p of roster) if (p.championId && !used.has(p.championId)) { used.add(p.championId); history.push({ game: game.game, teamId: game[`${side}TeamId`], championId: p.championId, role: archiveRole(p.role), playerName: p.name }); }
    for (const id of game.draft[`${side}Picks`]) if (id && !used.has(id)) { used.add(id); history.push({ game: game.game, teamId: game[`${side}TeamId`], championId: id, role: '未确认分路' }); }
  }
  const currentSeries = state.match.seriesId === result.seriesId && [state.match.blueTeamId, state.match.redTeamId].sort().join('\0') === pair(result);
  const rules = currentSeries ? state.production?.rules : undefined, nextGame = result.game + 1;
  // Draft history may include retained remake picks. Its array order carries no reliable lane identity.
  if (currentSeries) for (const h of state.draftHistory ?? []) if (h.seriesId === result.seriesId && h.game <= result.game && [h.blueTeamId, h.redTeamId].sort().join('\0') === pair(result)) {
    for (const side of ['blue', 'red'] as const) for (const id of h[`${side}Picks`]) if (id && !history.some(p => p.game === h.game && p.teamId === h[`${side}TeamId`] && p.championId === id)) history.push({ game: h.game, teamId: h[`${side}TeamId`], championId: id, role: '未确认分路', retainedRemake: true });
  }
  const active = result.seriesComplete ? false : rules ? rules.mode !== 'standard' && !rules.exceptionGames.includes(nextGame) : null;
  const restricted = (teamId: string) => active === true ? [...new Set(history.filter(p => rules?.scope === 'all' || p.teamId === teamId).map(p => p.championId))] : [];
  return { history, nextGame, active, scope: rules?.scope, restricted, reason: result.seriesComplete ? '系列赛已结束 · 展示已选英雄历史' : active === null ? '下一局规则尚未确认 · 展示已选历史' : active === false ? `按当前规则，第 ${nextGame} 局不启用历史英雄限制` : `按当前规则，第 ${nextGame} 局 · ${rules?.scope === 'team' ? '各队已用英雄禁选' : '双方已用英雄共同禁选'}` };
}

export interface ArchiveItemEvent { time: number; participantId: number; type: 'ITEM_PURCHASED' | 'ITEM_SOLD' | 'ITEM_DESTROYED' | 'ITEM_UNDO'; itemId?: number; beforeId?: number; afterId?: number }
export interface ArchiveItemParticipant { participantId: number; name?: string; championId?: string }
/** Join raw details by participantId. Repeated or absent identifiers stay unresolved. */
export function archiveItemParticipants(raw: unknown, result: GameResult, champions: Champion[]): Record<number, ArchiveItemParticipant> {
  const data = raw as { gameId?: unknown; participants?: Record<string, unknown>[]; participantIdentities?: { participantId?: unknown; player?: Record<string, unknown> }[] } | undefined;
  if (!data || String(data.gameId ?? '') !== result.sourceGameId || !Array.isArray(data.participants)) return {};
  const names = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 300;
  const participants: Record<number, ArchiveItemParticipant> = {};
  for (const p of data.participants) {
    if (!p || typeof p !== 'object') continue;
    const id = p.participantId;
    if (!Number.isInteger(id) || (id as number) < 1 || (id as number) > 10 || data.participants.filter(other => other?.participantId === id).length !== 1) continue;
    const identities = (Array.isArray(data.participantIdentities) ? data.participantIdentities : []).filter(i => i?.participantId === id);
    const identity = identities.length === 1 ? identities[0].player : undefined;
    const champion = champions.find(c => c.key === p.championId), side = p.teamId === 100 ? 'blue' : p.teamId === 200 ? 'red' : undefined;
    const saved = champion && side ? result.snapshot.players.filter(player => player.championId === champion.id && player.team === side) : [];
    const name = [p.riotIdGameName, p.summonerName, identity?.gameName, identity?.summonerName, saved.length === 1 ? saved[0].name : undefined].find(names);
    participants[id as number] = { participantId: id as number, ...(name ? { name } : {}), ...(champion ? { championId: champion.id } : {}) };
  }
  return participants;
}
/** LCU match timeline: raw.timeline.payload.frames[].events[]. timestamps are milliseconds. */
export function archiveItemEvents(raw: unknown, result: GameResult): ArchiveItemEvent[] | null {
  const data = raw as { gameId?: unknown; frames?: { events?: unknown[] }[] } | undefined;
  if (!data || !Array.isArray(data.frames) || !data.frames.length) return null;
  if (data.gameId !== undefined && (!result.sourceGameId || String(data.gameId) !== result.sourceGameId)) return null;
  const found: ArchiveItemEvent[] = [];
  for (const frame of data.frames) for (const candidate of Array.isArray(frame?.events) ? frame.events : []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const e = candidate as Record<string, unknown>, type = e.type;
    if (!['ITEM_PURCHASED', 'ITEM_SOLD', 'ITEM_DESTROYED', 'ITEM_UNDO'].includes(String(type)) || !valid(e.timestamp) || e.timestamp / 1000 > result.snapshot.duration + 2 || !Number.isInteger(e.participantId) || (e.participantId as number) < 1 || (e.participantId as number) > 10) continue;
    if (type === 'ITEM_UNDO' ? !Number.isInteger(e.beforeId) || !Number.isInteger(e.afterId) || (e.beforeId as number) < 0 || (e.afterId as number) < 0 : !Number.isInteger(e.itemId) || (e.itemId as number) <= 0) continue;
    const item = { time: e.timestamp / 1000, participantId: e.participantId as number, type: type as ArchiveItemEvent['type'], ...(type === 'ITEM_UNDO' ? { beforeId: e.beforeId as number, afterId: e.afterId as number } : { itemId: e.itemId as number }) };
    // Multiple identical purchases can share a timestamp (for example two potions).
    found.push(item);
  }
  return found.sort((a, b) => a.time - b.time || a.participantId - b.participantId);
}
