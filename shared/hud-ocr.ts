import type { BroadcastState, EconomyRoi, HudObjective, OcrMatchData, Player, Side } from './types';
import { gameResultKey } from './game-results';

export const hudObjectives = ['towers', 'dragons', 'barons', 'voidgrubs'] as const;
export const hudObjectiveLabels: Record<HudObjective, string> = { towers: '防御塔', dragons: '小龙', barons: '大龙', voidgrubs: '虚空巢虫' };
const region = (x: number, width = 26): EconomyRoi => ({ x: x / 1655, y: 14 / 927, width: width / 1655, height: 24 / 927 });
/** Digit-only regions in the supplied native HUD. Blue and red have mirrored icon order. */
export const defaultObjectiveRegions: Record<Side, Record<HudObjective, EconomyRoi>> = {
  blue: { dragons: region(443), barons: region(505), voidgrubs: region(567, 28), towers: region(641) },
  red: { towers: region(1018), voidgrubs: region(1075, 27), barons: region(1141, 28), dragons: region(1208, 28) },
};
export function ocrMatchKey(state: Pick<BroadcastState, 'mode' | 'match' | 'production'>): string {
  return JSON.stringify([gameResultKey(state), state.match.blueTeamId, state.match.redTeamId]);
}
export function currentOcrMatch(state: BroadcastState): OcrMatchData | undefined {
  const data = state.ocrMatch;
  return data?.key === ocrMatchKey(state) && !(data.sourceGameId && state.activeSourceGameId && data.sourceGameId !== state.activeSourceGameId) ? data : undefined;
}
export function observedPlayerGold(data: OcrMatchData | undefined, player: Player) {
  const sample = data?.players[player.id];
  return sample?.team === player.team && sample.championId === player.championId ? sample : undefined;
}
/** A postgame view uses retained OCR observations, never default API objective zeros or inferred gold. */
export function postgameOcrView(state: BroadcastState): BroadcastState {
  if (state.mode !== 'live') return state;
  const data = currentOcrMatch(state);
  const players = state.players.map(player => {
    const sample = observedPlayerGold(data, player);
    return { ...player, gold: sample?.value ?? (player.goldSource === 'ocr' ? player.gold : null) };
  });
  const economy = data?.economy ?? state.economy.filter(point => point.source === 'ocr');
  const last = economy.at(-1);
  return { ...state, players, economy, stats: {
    blue: { ...state.stats.blue, gold: data?.teamGold?.blue ?? last?.blue ?? null },
    red: { ...state.stats.red, gold: data?.teamGold?.red ?? last?.red ?? null },
  } };
}
