import type { BroadcastState, IncomeCategory, IncomeSnapshot, IncomeValue, Player, PlayerIncomeSnapshot } from '../shared/types';

// This module stays browser-safe so the control desk and overlay select the same saved card.
export const incomeCategories = ['kills', 'minions', 'monsters', 'towers', 'passive', 'other'] as const;
export const incomeCategoryLabels: Record<IncomeCategory, string> = { kills: '击杀', minions: '小兵', monsters: '野怪', towers: '防御塔', passive: '自增', other: '其他' };
export const incomeTargetTime = 600 as const;
const maximumCaptureDelay = 5;
type IncomeContext = Pick<BroadcastState, 'mode' | 'match' | 'gameTime' | 'players'>;
const finiteGold = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000;

type GameIdentityContext = Pick<BroadcastState, 'mode' | 'match'> & Partial<Pick<BroadcastState, 'players'>>;
const gameIdentity = (state: GameIdentityContext): unknown[] => [state.mode, state.match.seriesId || state.match.title, state.match.game, [state.match.blueTeamId, state.match.redTeamId].sort()];
const rosterIdentity = (players: {id: string; team: Player['team']; championId: string}[]): string[] => players.map(player => JSON.stringify([player.id, player.team, player.championId])).sort();
const confirmedRoster = (players: Player[] | undefined): players is Player[] => !!players && players.length === 10 && new Set(players.map(player => player.id)).size === 10 &&
  players.every(player => !!player.championId && (player.id.startsWith('live-') || player.statsSource === 'api' || player.statsSource === 'ocr')) &&
  players.filter(player => player.team === 'blue').length === 5 && players.filter(player => player.team === 'red').length === 5;
const savedRosterIdentity = (snapshot: IncomeSnapshot): string[] => rosterIdentity(snapshot.players.map(player => ({id: player.playerId, team: player.team, championId: player.championId})));

export function incomeGameKey(state: GameIdentityContext): string {
  const identity = gameIdentity(state);
  if (state.mode === 'live' && confirmedRoster(state.players)) identity.push(rosterIdentity(state.players));
  return JSON.stringify(identity);
}

export function currentIncomeSnapshot(state: BroadcastState): IncomeSnapshot | undefined {
  if (state.mode === 'demo') return state.incomeSnapshots?.find(snapshot => snapshot.mode === 'demo' && snapshot.gameKey === incomeGameKey(state));
  if (state.players.length && !confirmedRoster(state.players)) return undefined;
  const key = incomeGameKey(state);
  const base = JSON.stringify(gameIdentity(state));
  const roster = state.players.length ? JSON.stringify(rosterIdentity(state.players)) : undefined;
  const compatible = (snapshot: IncomeSnapshot): boolean => {
    if (snapshot.mode !== 'live' || (roster !== undefined && JSON.stringify(savedRosterIdentity(snapshot)) !== roster)) return false;
    try { const identity = JSON.parse(snapshot.gameKey); return Array.isArray(identity) && JSON.stringify(identity.slice(0, 4)) === base; } catch { return false; }
  };
  if (roster === undefined) return state.incomeSnapshots?.find(compatible);
  return state.incomeSnapshots?.find(snapshot => snapshot.gameKey === key && compatible(snapshot)) ?? state.incomeSnapshots?.find(compatible);
}

/** Only accepts explicit gold amounts from a compatible telemetry extension; counts are never converted into gold. */
export function normalizeIncomeValues(value: unknown): Partial<Record<IncomeCategory, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const result: Partial<Record<IncomeCategory, number>> = {};
  for (const category of incomeCategories) if (finiteGold(source[category])) result[category] = source[category];
  return Object.keys(result).length ? result : undefined;
}

export class IncomeTelemetryError extends Error {}
const telemetryRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IncomeTelemetryError('经济数据桥内容必须为对象');
  return value as Record<string, unknown>;
};

/** Fill only unavailable fields in an already observed ten-minute card using the bridge's saved sample. */
export function mergeIncomeTelemetry(state: BroadcastState, input: unknown): IncomeSnapshot {
  const payload = telemetryRecord(input);
  const current = currentIncomeSnapshot(state);
  if (state.mode !== 'live' || !current || current.mode !== 'live' || current.status !== 'partial') throw new IncomeTelemetryError('请先取得本局十分钟实际采样；数据桥仅可补齐缺少分类的十分钟卡片');
  if (payload.gameKey !== current.gameKey) throw new IncomeTelemetryError('经济数据桥的系列或局号与当前十分钟卡片不一致');
  if (payload.capturedTime !== current.capturedTime || current.capturedTime < incomeTargetTime || current.capturedTime > incomeTargetTime + maximumCaptureDelay) throw new IncomeTelemetryError('经济数据桥时间戳须与已保存的 600–605 秒实际采样完全一致');
  if (!Array.isArray(payload.players) || !payload.players.length || payload.players.length > 10) throw new IncomeTelemetryError('经济数据桥每次须提供 1–10 名选手');
  const merged = structuredClone(current);
  const seen = new Set<string>();
  for (const raw of payload.players) {
    const row = telemetryRecord(raw);
    if (typeof row.playerId !== 'string' || seen.has(row.playerId)) throw new IncomeTelemetryError('经济数据桥的选手标识缺失或重复');
    seen.add(row.playerId);
    const player = merged.players.find(saved => saved.playerId === row.playerId);
    if (!player) throw new IncomeTelemetryError('经济数据桥选手未出现在本局十分钟采样中');
    const amounts = telemetryRecord(row.values);
    if (!Object.keys(amounts).length || Object.keys(amounts).some(key => !incomeCategories.includes(key as IncomeCategory))) throw new IncomeTelemetryError('经济来源须使用 kills、minions、monsters、towers、passive、other 类别');
    for (const key of incomeCategories) {
      if (!(key in amounts)) continue;
      const value = amounts[key];
      if (!finiteGold(value)) throw new IncomeTelemetryError('经济来源金额须为 0–1000000 的有限非负数');
      const previous = player.values[key];
      if (previous.value !== null && previous.value !== value) throw new IncomeTelemetryError('经济数据桥不能改写十分钟卡片中已确认的分类金额');
      if (previous.value === null) player.values[key] = { value, source: 'telemetry' };
    }
    if (row.totalGold !== undefined) {
      if (!finiteGold(row.totalGold)) throw new IncomeTelemetryError('累计经济须为 0–1000000 的有限非负数');
      if (player.totalGold !== null && player.totalGold !== row.totalGold) throw new IncomeTelemetryError('经济数据桥不能改写十分钟卡片中已确认的累计金额');
      player.totalGold = row.totalGold;
    }
    if (player.totalGold !== null && incomeCategories.reduce((sum, key) => sum + (player.values[key].value ?? 0), 0) > player.totalGold + 1) throw new IncomeTelemetryError('经济来源分类金额之和超过了十分钟累计金额');
  }
  const complete = merged.players.every(player => incomeCategories.every(key => player.values[key].value !== null));
  merged.status = complete ? 'ready' : 'partial';
  merged.detail = complete ? '已从兼容赛事数据桥补齐十分钟经济来源，可在后续随时调用。' : '已接收兼容赛事数据桥的十分钟分类；其余未提供的经济来源继续显示“未提供”。';
  state.incomeSnapshots = (state.incomeSnapshots ?? []).map(saved => saved === current ? merged : saved);
  return merged;
}

const tenMinuteSource = (source: Player['statsSource'] | Player['goldSource'], gameTime: number | undefined, legacy = false): boolean =>
  gameTime === undefined ? legacy && source === undefined : (legacy || source !== undefined) && Number.isFinite(gameTime) && gameTime >= incomeTargetTime && gameTime <= incomeTargetTime + maximumCaptureDelay;

function savedPlayer(player: Player, late: boolean): PlayerIncomeSnapshot {
  const values = Object.fromEntries(incomeCategories.map(category => {
    const value = late ? undefined : player.income?.[category];
    return [category, finiteGold(value) ? { value, source: 'api' } : { value: null, source: 'unavailable' }];
  })) as Record<IncomeCategory, IncomeValue>;
  const total = !late && tenMinuteSource(player.goldSource, player.goldGameTime, true) && finiteGold(player.gold) ? player.gold : null;
  const observedStats = !late && player.statsAvailable !== false && tenMinuteSource(player.statsSource, player.statsGameTime, true);
  // A classification summing above the supplied total is inconsistent. Keep the observed total, discard all categories.
  if (total !== null && incomeCategories.reduce((sum, key) => sum + (values[key].value ?? 0), 0) > total + 1) {
    for (const key of incomeCategories) values[key] = { value: null, source: 'unavailable' };
  }
  return { playerId: player.id, name: player.name, role: player.role, championId: player.championId, team: player.team,
    ...(player.portrait ? { portrait: player.portrait } : {}), totalGold: total,
    kills: observedStats ? player.kills : null, deaths: observedStats ? player.deaths : null, assists: observedStats ? player.assists : null, cs: observedStats ? player.cs : null, values };
}

/** Fill delayed on-time readings only; already confirmed values and classification telemetry stay frozen. */
function fillObservedPlayers(state: BroadcastState, snapshot: IncomeSnapshot): void {
  if (state.gameTime > incomeTargetTime + maximumCaptureDelay || snapshot.mode !== 'live') return;
  for (const saved of snapshot.players) {
    const observed = state.players.find(player => player.id === saved.playerId && player.team === saved.team && player.championId === saved.championId);
    if (!observed) continue;
    if (saved.totalGold === null && tenMinuteSource(observed.goldSource, observed.goldGameTime) && finiteGold(observed.gold) &&
        incomeCategories.reduce((sum, category) => sum + (saved.values[category].value ?? 0), 0) <= observed.gold + 1) saved.totalGold = observed.gold;
    if (observed.statsAvailable !== false && tenMinuteSource(observed.statsSource, observed.statsGameTime)) {
      for (const key of ['kills', 'deaths', 'assists', 'cs'] as const) if (saved[key] === null && Number.isInteger(observed[key]) && observed[key] >= 0) saved[key] = observed[key];
    }
  }
}

function capture(state: BroadcastState, late: boolean, now: string): IncomeSnapshot {
  const players = state.players.map(player => savedPlayer(player, late));
  const complete = players.every(player => incomeCategories.every(category => player.values[category].value !== null));
  const status = late ? 'late' : complete ? 'ready' : 'partial';
  return { id: `income:${incomeGameKey(state)}:${incomeTargetTime}`, gameKey: incomeGameKey(state), targetTime: incomeTargetTime,
    capturedTime: state.gameTime, createdAt: now, mode: state.mode, status, players,
    detail: late ? `连接时已到 ${Math.floor(state.gameTime / 60)}:${String(Math.floor(state.gameTime % 60)).padStart(2, '0')}，未取得 10:00 时的数据；回放跳回 10:00 可重新采集。`
      : complete ? '已冻结十分钟经济来源，可在后续随时调用。'
        : '已冻结十分钟选手数据；当前数据源未提供的经济来源显示“未提供”，接入兼容赛事数据源后可完整呈现。' };
}

/** Capture once per series/game. Saved cards are retained on restart and replay seeks. */
export function updateIncomeSnapshots(state: BroadcastState, previous?: IncomeContext, now = new Date().toISOString()): void {
  if (!Number.isFinite(state.gameTime) || state.gameTime < incomeTargetTime || !['live', 'postgame'].includes(state.phase) || !state.players.length) return;
  const existing = currentIncomeSnapshot(state);
  if (existing && existing.status !== 'late') {
    if (state.mode === 'live') fillObservedPlayers(state, existing);
    return;
  }
  if (state.mode === 'demo') {
    const sample = createDemoIncomeSnapshot(state, now);
    state.incomeSnapshots = [sample, ...(state.incomeSnapshots ?? []).filter(card => card.gameKey !== sample.gameKey)].slice(0, 100);
    return;
  }
  // A partial API response or an LCU placeholder must not overwrite another game's history.
  if (!confirmedRoster(state.players)) return;
  const crossed = previous && incomeGameKey(previous) === incomeGameKey(state) && previous.gameTime < incomeTargetTime;
  const onTime = state.gameTime <= incomeTargetTime + maximumCaptureDelay;
  if (existing?.status === 'late' && !(crossed && onTime)) return;
  const sample = capture(state, !onTime, now);
  state.incomeSnapshots = [sample, ...(state.incomeSnapshots ?? []).filter(card => card.gameKey !== sample.gameKey)].slice(0, 100);
}

/** A separate, explicitly synthetic 10:00 card; it never relabels the demo's current 18-minute totals. */
export function createDemoIncomeSnapshot(state: BroadcastState, now = new Date().toISOString()): IncomeSnapshot {
  const players: PlayerIncomeSnapshot[] = state.players.map((player, index) => {
    const support = player.role === '辅助', jungle = player.role === '打野';
    const kills = support ? 0 : index % 3;
    const raw: Record<IncomeCategory, number> = { kills: kills * 300, minions: support ? 80 : jungle ? 280 : 1620 + index * 37,
      monsters: jungle ? 1280 + index * 31 : index % 2 ? 105 : 0, towers: index % 4 ? 0 : 160, passive: 1213, other: support ? 980 : 500 };
    const values = Object.fromEntries(incomeCategories.map(key => [key, { value: raw[key], source: 'demo' }])) as Record<IncomeCategory, IncomeValue>;
    return { playerId: player.id, name: player.name, role: player.role, championId: player.championId, team: player.team,
      ...(player.portrait ? { portrait: player.portrait } : {}), kills, deaths: index % 2, assists: support ? 4 : 2, cs: support ? 4 : jungle ? 56 : 84 + index * 2,
      totalGold: incomeCategories.reduce((sum, key) => sum + raw[key], 0), values };
  });
  return { id: `income:${incomeGameKey(state)}:${incomeTargetTime}`, gameKey: incomeGameKey(state), targetTime: incomeTargetTime, capturedTime: incomeTargetTime,
    createdAt: now, mode: 'demo', status: 'ready', players, detail: '十分钟经济来源演示数据，用于导播排版与切换。' };
}
