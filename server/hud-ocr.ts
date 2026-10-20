import type { BroadcastState, HudObjective, OcrMatchData, OcrObservation, Side } from '../shared/types';
import { currentOcrMatch, hudObjectives, ocrMatchKey } from '../shared/hud-ocr';
import { currentGameResult } from '../shared/game-results';

export function writableOcrMatch(state: BroadcastState): OcrMatchData | undefined {
  if (state.mode !== 'live' || currentGameResult(state) || state.awaitingNextGame || state.gameClock?.awaitingLiveSample) return;
  if (!currentOcrMatch(state)) state.ocrMatch = { key: ocrMatchKey(state), players: {}, objectives: { blue: {}, red: {} }, economy: [] };
  if (state.activeSourceGameId) state.ocrMatch!.sourceGameId = state.activeSourceGameId;
  return state.ocrMatch;
}
export function retainTeamGold(data: OcrMatchData, blue: number, red: number, at: number, gameTime: number, source: 'ocr' | 'api' | 'memory' = 'ocr'): void {
  if (![blue, red, at, gameTime].every(Number.isFinite) || blue < 0 || red < 0 || gameTime < 0) return;
  if (data.teamGold && (gameTime < data.teamGold.gameTime || at < Date.parse(data.teamGold.sampledAt))) return;
  data.teamGold = { ...(source!=='ocr'?{source}:{}), blue, red, sampledAt: new Date(at).toISOString(), gameTime };
  const point = { time: gameTime, blue, red, source }, last = data.economy.at(-1);
  // Five-second bins preserve a full day's samples without inventing points in unseen intervals.
  if (last && Math.floor(last.time / 5) === Math.floor(gameTime / 5)) data.economy[data.economy.length - 1] = point;
  else data.economy.push(point);
  data.economy = data.economy.slice(-17281);
}
export function parseObjectiveCount(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length > 8) return;
  const text = value.normalize('NFKC').trim();
  // Never coerce blank strings, ambiguous letters, percentages or unrelated HUD text to zero.
  if (!/^(?:0|[1-9]\d?)$/.test(text)) return;
  return Number(text);
}
/** Each cell is independent. Two consecutive captures confirm a new count; gaps break candidates. */
export class ObjectiveCounterTracker {
  private pending = new Map<string, { value: number; at: number; gameTime: number }>();
  clear(): void { this.pending.clear(); }
  accept(raw: unknown, previous: OcrMatchData | undefined, at: number, gameTime: number): Record<Side, Partial<Record<HudObjective, OcrObservation>>> {
    const result: Record<Side, Partial<Record<HudObjective, OcrObservation>>> = { blue: {}, red: {} };
    for (const side of ['blue', 'red'] as const) for (const key of hudObjectives) {
      const text = (raw as any)?.[side]?.[key], value = parseObjectiveCount(text), id = `${side}:${key}`;
      const last = previous?.objectives[side][key], candidate = this.pending.get(id);
      if (value === undefined || last && (value < last.value || gameTime < last.gameTime || at < Date.parse(last.sampledAt))) { this.pending.delete(id); continue; }
      if (last?.value === value || candidate?.value === value && at > candidate.at && at - candidate.at <= 10000 && gameTime >= candidate.gameTime) {
        result[side][key] = { value, sampledAt: new Date(at).toISOString(), gameTime, raw: text };
        this.pending.delete(id);
      } else this.pending.set(id, { value, at, gameTime });
    }
    return result;
  }
}
