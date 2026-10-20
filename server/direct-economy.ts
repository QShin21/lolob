import type { EconomyFeed, Player } from '../shared/types';

/** All ten cumulative balances must belong to this game-time sample. */
export function directEconomy(players: Player[], gameTime: number, now = Date.now()): EconomyFeed {
  const missing: EconomyFeed = { source: 'none', status: 'waiting', detail: '等待十名选手同一时刻的累计金币', blue: null, red: null };
  if (players.length !== 10 || new Set(players.map(p => p.id)).size !== 10 ||
      ['blue', 'red'].some(side => players.filter(p => p.team === side).length !== 5)) return missing;
  const source = players.every(p => p.goldSource === 'memory') ? 'memory' :
    players.every(p => p.goldSource === 'api') ? 'api' : undefined;
  if (!source) return missing;
  const times = players.map(p => Date.parse(p.goldSampledAt ?? ''));
  const expiry = players.map((p, i) => Math.min(times[i] + (source === 'memory' ? 3000 : 5000),
    p.goldExpiresAt ? Date.parse(p.goldExpiresAt) : Infinity));
  if (players.some((p, i) => p.gold === null || !Number.isFinite(p.gold) || p.gold < 0 ||
      !Number.isFinite(p.goldGameTime) || Math.abs(p.goldGameTime! - gameTime) > 2 ||
      !Number.isFinite(times[i]) || !Number.isFinite(expiry[i]) || now < times[i] - 1000 || now > expiry[i]) ||
      Math.max(...times) - Math.min(...times) > 1000) return { ...missing, source, status: 'stale', detail: '累计金币采样已失效，等待当前观战数据' };
  const total = (side: string) => players.filter(p => p.team === side).reduce((sum, p) => sum + p.gold!, 0);
  return { source, status: 'fresh', blue: total('blue'), red: total('red'), gameTime,
    sampledAt: new Date(Math.min(...times)).toISOString(), expiresAt: new Date(Math.min(...expiry)).toISOString(),
    detail: `${source === 'memory' ? '国服观战直读' : '客户端 API'} · 每队五名选手累计金币合计` };
}
