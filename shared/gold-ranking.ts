import type { BroadcastState, Player } from './types';

export interface GoldRankingRow { player: Player; gold: number | null; rank: number | null; percentage: number }
export function rankingGold(state: Pick<BroadcastState, 'mode' | 'gameClock' | 'connections'>, player: Player, now = Date.now()): number | null {
  if (player.gold == null || !Number.isFinite(player.gold) || player.gold < 0) return null;
  if (state.mode === 'demo') return player.gold;
  if (state.gameClock?.awaitingLiveSample) return null;
  if (player.goldSource === 'ocr') return Date.parse(player.goldExpiresAt ?? '') > now ? player.gold : null;
  if (player.goldSource === 'api') {
    const sampled = Date.parse(player.goldSampledAt ?? state.connections.live.updatedAt ?? '');
    return state.connections.live.status === 'connected' && now - sampled >= -1000 && now - sampled <= 10000 ? player.gold : null;
  }
  return null;
}
/** Compare both teams in one descending list; stable ties never depend on API roster order. */
export function goldRanking(state: BroadcastState, now = Date.now()): GoldRankingRow[] {
  const rows = state.players.slice(0, 10).map(player => ({ player, gold: rankingGold(state, player, now) }));
  rows.sort((a, b) => (b.gold ?? -1) - (a.gold ?? -1) || a.player.id.localeCompare(b.player.id));
  const max = Math.max(1, ...rows.map(row => row.gold ?? 0));
  return rows.map((row, index) => ({ ...row, rank: row.gold === null ? null : index + 1, percentage: row.gold === null ? 0 : row.gold / max * 100 }));
}
