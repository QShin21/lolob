import { randomUUID } from 'node:crypto';
import type { BroadcastState, DraftHistoryGame, DraftState, Player } from '../shared/types';

type Picks = Pick<DraftState, 'bluePicks' | 'redPicks'>;
type Source = DraftHistoryGame['source'];
export interface LcuDraftSample { phase: string; draft?: DraftState; players?: Player[]; gameId?: string | number }

const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9]{1,64}$/.test(value) && value !== '0';
function complete(picks: Picks): boolean {
  return Array.isArray(picks.bluePicks) && Array.isArray(picks.redPicks) && picks.bluePicks.length === 5 && picks.redPicks.length === 5 &&
    [...picks.bluePicks, ...picks.redPicks].every(validId) && new Set([...picks.bluePicks, ...picks.redPicks]).size === 10;
}
function validHistory(value: unknown): value is DraftHistoryGame {
  if (!value || typeof value !== 'object') return false;
  const entry = value as DraftHistoryGame;
  return typeof entry.seriesId === 'string' && !!entry.seriesId && entry.seriesId.length <= 150 &&
    Number.isInteger(entry.game) && entry.game > 0 && entry.game <= 99 && typeof entry.blueTeamId === 'string' && !!entry.blueTeamId &&
    typeof entry.redTeamId === 'string' && !!entry.redTeamId && entry.blueTeamId !== entry.redTeamId && complete(entry) &&
    ['lcu', 'live', 'manual', 'demo'].includes(entry.source) && typeof entry.recordedAt === 'string' && Number.isFinite(Date.parse(entry.recordedAt));
}
const gameId = (value: string | number | undefined): string | undefined => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) && value !== '0' ? value : undefined;
};
const fingerprint = (picks: Picks): string => [...picks.bluePicks, ...picks.redPicks].sort().join('|');
const sameTeams = (entry: DraftHistoryGame, state: BroadcastState): boolean =>
  [entry.blueTeamId, entry.redTeamId].sort().join('\0') === [state.match.blueTeamId, state.match.redTeamId].sort().join('\0');
const currentGame = (entry: DraftHistoryGame, state: BroadcastState): boolean =>
  entry.seriesId === state.match.seriesId && entry.game === state.match.game && sameTeams(entry, state);

/** Migrate old persisted states without losing completed series or a locked pending draft. */
export function initializeDraftHistory(state: BroadcastState): void {
  if (!state.match.seriesId) state.match.seriesId = `series-${randomUUID()}`;
  state.draftHistory = (Array.isArray(state.draftHistory) ? state.draftHistory : []).filter(validHistory);
  if (state.draftHistoryPending && (!validHistory(state.draftHistoryPending) || !currentGame(state.draftHistoryPending, state))) delete state.draftHistoryPending;
}

/** Each series is independent; changing blue/red side preserves team identity. */
export function startDraftSeries(state: BroadcastState, seriesId = `series-${randomUUID()}`): void {
  state.match.seriesId = seriesId;
  delete state.draftHistoryPending;
  initializeDraftHistory(state);
}

export function getFearlessHistory(state: BroadcastState): DraftHistoryGame[] {
  return (state.draftHistory ?? []).filter(entry => validHistory(entry) && entry.seriesId === state.match.seriesId && entry.game < state.match.game && sameTeams(entry, state)).sort((a, b) => a.game - b.game);
}
export function getFearlessBans(state: BroadcastState): Set<string> {
  return new Set(getFearlessHistory(state).flatMap(entry => [...entry.bluePicks, ...entry.redPicks]));
}
export function historyForTeam(state: BroadcastState, teamId: string): { game: number; picks: string[] }[] {
  return getFearlessHistory(state).map(entry => ({ game: entry.game, picks: [...(entry.blueTeamId === teamId ? entry.bluePicks : entry.redTeamId === teamId ? entry.redPicks : [])] })).filter(entry => entry.picks.length > 0);
}

function playerPicks(players: Player[]): Picks | undefined {
  const bluePicks = players.filter(player => player.team === 'blue').map(player => player.championId);
  const redPicks = players.filter(player => player.team === 'red').map(player => player.championId);
  const picks = { bluePicks, redPicks };
  return complete(picks) ? picks : undefined;
}
function entryFor(state: BroadcastState, picks: Picks, source: Source, sourceGameId?: string): DraftHistoryGame {
  return { seriesId: state.match.seriesId!, game: state.match.game, blueTeamId: state.match.blueTeamId, redTeamId: state.match.redTeamId,
    bluePicks: [...picks.bluePicks], redPicks: [...picks.redPicks], recordedAt: new Date().toISOString(), source, ...(sourceGameId ? { sourceGameId } : {}) };
}
function writeHistory(state: BroadcastState, picks: Picks, source: Source, sourceGameId?: string): boolean {
  initializeDraftHistory(state);
  if (!complete(picks)) return false;
  const entries = state.draftHistory!;
  // Polling may still return the preceding game after the director advances the game number.
  if (entries.some(entry => entry.seriesId === state.match.seriesId && entry.game !== state.match.game && sameTeams(entry, state) &&
    ((sourceGameId && entry.sourceGameId === sourceGameId) || fingerprint(entry) === fingerprint(picks)))) return false;
  const index = entries.findIndex(entry => currentGame(entry, state));
  const existing = index >= 0 ? entries[index] : undefined;
  if (existing?.sourceGameId && sourceGameId && existing.sourceGameId !== sourceGameId) return false;
  const next = entryFor(state, picks, source, sourceGameId ?? existing?.sourceGameId);
  if (existing) {
    next.recordedAt = existing.recordedAt;
    // Preserve the observed roster if delayed gameflow or manual scene changes arrive.
    const priority: Record<Source, number> = { demo: 0, manual: 1, lcu: 2, live: 3 };
    if (priority[existing.source] > priority[source]) return false;
    entries[index] = next;
  } else entries.push(next);
  state.draftHistory = entries.slice(-1000);
  delete state.draftHistoryPending;
  return true;
}

/** Preselections and cancelled champion select sessions never become a global ban. */
export function observeLcuDraft(state: BroadcastState, sample: LcuDraftSample): void {
  if (state.mode !== 'live') return;
  initializeDraftHistory(state);
  if (sample.phase === 'ChampSelect') {
    if (!sample.draft?.locked || !complete(sample.draft)) { delete state.draftHistoryPending; return; }
    // Trades update roster champion IDs after all pick actions have been completed.
    const picks = sample.players ? playerPicks(sample.players) ?? sample.draft : sample.draft;
    state.draftHistoryPending = entryFor(state, picks, 'lcu', gameId(sample.gameId));
    return;
  }
  if (['GameStart', 'InProgress', 'Reconnect'].includes(sample.phase)) {
    const pending = state.draftHistoryPending;
    if (pending && currentGame(pending, state)) writeHistory(state, pending, 'lcu', gameId(sample.gameId) ?? pending.sourceGameId);
    return;
  }
  if (['None', 'Lobby', 'Matchmaking', 'ReadyCheck', 'FailedToLaunch', 'TerminatedInError'].includes(sample.phase)) delete state.draftHistoryPending;
}

/** A complete observed game roster also supports spectating/replays without an LCU draft session. */
export function captureLiveDraft(state: BroadcastState, sourceGameId?: string | number): void {
  if (state.mode !== 'live') return;
  initializeDraftHistory(state);
  const picks = playerPicks(state.players);
  if (!picks) return;
  const id = gameId(sourceGameId) ?? state.draftHistoryPending?.sourceGameId;
  if (writeHistory(state, picks, 'live', id)) {
    state.draft.bluePicks = [...picks.bluePicks];
    state.draft.redPicks = [...picks.redPicks];
    state.draft.locked = true;
  }
}

/** Entering live is the director's confirmation for a manually entered complete draft. */
export function captureManualDraft(state: BroadcastState): void {
  if (state.phase !== 'live') return;
  if (writeHistory(state, state.draft, state.mode === 'demo' ? 'demo' : 'manual')) state.draft.locked = true;
}
