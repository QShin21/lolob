import type { BroadcastState, Player } from './types';
import type { CheckId, ProgramContent, ProductionState, Telemetry } from './production-types';
import { bundledChampionVersion } from './champion-art';
import { currentGameResult, frozenGameState, gameResultKey, reportGameResult } from './game-results';

export const productionKey = (s: BroadcastState) => JSON.stringify([s.mode, s.match.seriesId, s.match.game, s.production?.attempt ?? 1, s.match.blueTeamId, s.match.redTeamId]);
export function productionDefaults(): ProductionState {
  return { configVersion: 1, checks: {}, scores: {}, baseScores: {}, rules: { mode: 'fearless', scope: 'all', exceptionGames: [], remakeHistory: 'discard' },
    draftMode: 'auto', draftUndo: [], assignments: [], attempt: 1, invalidAttempts: [], corrections: [], entry: 'waiting', analysisSeconds: 15,
    feedHold: false, dynamicPreview: false, layout: 'single', versions: { game: '', resources: bundledChampionVersion, ocr: 'spectator-1920-v1' }, marks: [], objectives: [], objectiveRules: [], clips: [], videos: [], rundown: [],
    hotkeys: { take: 'Control+Enter', live: 'Control+Shift+L', analysis: 'Control+Shift+A', feeds: 'Control+Shift+F', emergency: 'Control+Shift+P', undo: 'Control+Shift+Z' },
    keyboardTarget: 'workbench', cameraHints: '将键盘焦点切回观战客户端，按本机已核对的观战键位跟随、取消跟随、切换战争迷雾和视图。', alerts: [], audit: [] };
}
export function ensureProduction(s: BroadcastState): ProductionState {
  if (!s.production) s.production = productionDefaults();
  const p = s.production;
  for (const side of ['blue', 'red'] as const) {
    const id = s.match[`${side}TeamId`];
    if (p.scores[id] === undefined) p.scores[id] = s.match[`${side}Score`];
    if (p.baseScores[id] === undefined) p.baseScores[id] = p.scores[id] - (s.gameResults ?? []).filter(r => r.seriesId === s.match.seriesId && r.winnerTeamId === id).length;
  }
  return p;
}
export function telemetry(s: BroadcastState): Telemetry {
  return structuredClone({ players: s.players, stats: s.stats, events: s.events, economy: s.economy, economyFeed: s.economyFeed, gameTime: s.gameTime, gameClock: s.gameClock, paused: s.paused, phase: s.phase });
}
export function captureProgram(s: BroadcastState): ProgramContent {
  const p = ensureProduction(s);
  return structuredClone({ version: p.configVersion, key: productionKey(s), takenAt: new Date().toISOString(), mode: s.mode, match: s.match, teams: s.teams, overlay: s.overlay, selectedPlayerId: s.selectedPlayerId, draft: s.draft, telemetry: telemetry(s), draftManual: p.draftMode !== 'auto', assignments: p.assignments, versions: p.versions, rules: p.rules, attempt: p.attempt, schedule: s.schedule, draftHistory: s.draftHistory });
}
/** Configuration is copied at TAKE; same-game telemetry keeps advancing independently. */
export function programState(s: BroadcastState): BroadcastState {
  const c = s.production?.program;
  if (!c) return s;
  const recordedKey=gameResultKey({...s,mode:c.mode,match:c.match,production:{...ensureProduction(s),attempt:c.attempt??1}});
  const recorded=s.gameResults?.find(result=>result.key===recordedKey);
  const result=c.key===productionKey(s)?recorded:undefined;
  const current=result?frozenGameState(s,result):s;
  const same = c.key === productionKey(s) && (!!result || s.mode==='demo' || s.players.length>0&&s.phase!=='pregame');
  const view: BroadcastState = { ...current, ...(same ? {} : c.telemetry), mode: c.mode, match: c.match, teams: c.teams, overlay: c.overlay, selectedPlayerId: c.selectedPlayerId, schedule: c.schedule ?? s.schedule, draftHistory: c.draftHistory,
    production: { ...ensureProduction(s), assignments: c.assignments ?? [], versions: c.versions ?? ensureProduction(s).versions, rules: c.rules ?? ensureProduction(s).rules, attempt: c.attempt ?? 1 }, draft: same && !c.draftManual ? current.draft : c.draft };
  if(recorded){view.finishedGameId=recorded.id;view.reportGameId=recorded.id;}
  if (same) view.players = applyIdentity(view, current.players).map(player => {
    const previous = c.telemetry.players.find(p => p.id === player.id);
    const assignment = c.assignments?.find(a => a.locked && a.playerId === player.id);
    const staged = s.production?.assignments.find(a => a.locked && a.playerId===player.id);
    return { ...player, ...(previous ? { name: previous.name, portrait: previous.portrait, ...(staged&&!assignment?{role:previous.role,championId:previous.championId,championName:previous.championName}:{}) } : {}),
      ...(assignment ? { championId: assignment.championId, role: assignment.role, championName: previous?.championName ?? player.championName } : {}) };
  });
  return view;
}
export function objectiveRemaining(s: BroadcastState, objective: ProductionState['objectives'][number], now=Date.now()): number | null {
  const clock=s.gameClock, age=now-Date.parse(clock?.sampledAt??'');
  if(objective.dueTime===undefined||objective.key!==productionKey(s)||objective.gameVersion!==s.production?.versions.game||!clock||clock.awaitingLiveSample||clock.sessionId!==objective.clockSession||clock.discontinuity!==objective.discontinuity||!Number.isFinite(age)||age< -1000||age>clock.validForMs)return null;
  return Math.max(0,objective.dueTime-s.gameTime);
}
export function preserveProgram(s: BroadcastState): void {
  const p = ensureProduction(s);
  if (!p.program) p.program = captureProgram(s);
  if (p.program.key === productionKey(s)) p.program.telemetry = telemetry(programState(s));
}
export function takeProgram(s: BroadcastState, scene=s.programScene): void {
  const p = ensureProduction(s);
  preserveProgram(s);
  if (p.program) p.previousProgram = { content: structuredClone(p.program), scene: s.programScene };
  const report=['postgame','ranking'].includes(scene)?currentGameResult(s)??reportGameResult(s):undefined;
  p.program = captureProgram(report?frozenGameState(s,report):s);
  requestApplication(s);
}
export function requestApplication(s: BroadcastState): void {
  const p = ensureProduction(s);
  p.application = { id: `${s.revision}:${Date.now()}:${Math.random().toString(36).slice(2)}`, version: p.program?.version ?? p.configVersion, status: 'requested', detail: '已接收切入，正在应用来源；请核对节目画面', at: new Date().toISOString() };
}
/** Publish only the completed manual switch, retaining telemetry collected while sources were prepared. */
export function publishProgram(s: BroadcastState, candidate: BroadcastState): void {
  const current=ensureProduction(s), next=ensureProduction(candidate);
  if(productionKey(s)!==productionKey(candidate))throw new Error('切入期间比赛身份已变化，请重新核对后 TAKE');
  s.programScene=candidate.programScene;
  for(const key of ['program','previousProgram','playingClipId','analysisEndsAt','feedHold','entry','application'] as const){
    if(next[key]===undefined)delete (current as unknown as Record<string,unknown>)[key];
    else (current as unknown as Record<string,unknown>)[key]=structuredClone(next[key]);
  }
  const action=next.audit.at(-1);if(action&&!current.audit.some(a=>a.id===action.id))current.audit.push(structuredClone(action));
}
/** Emergency return preserves the on-air match and any uncommitted edits. */
export function returnToGame(s: BroadcastState): void {
  const p = ensureProduction(s);
  preserveProgram(s);
  if (!p.program || !p.program.telemetry.players.length || ['pregame', 'draft'].includes(p.program.telemetry.phase)) throw new Error('当前节目尚未取得可返回的比赛内容，请先核对本局后 TAKE');
  p.previousProgram = { content: structuredClone(p.program), scene: s.programScene };
  s.programScene = 'live'; delete p.analysisEndsAt; delete p.playingClipId;
  requestApplication(s);
}
export function checkFingerprint(s: BroadcastState, id: CheckId): string {
  const p = s.production ?? productionDefaults();
  const identity = [productionKey(s), s.teams.filter(t => [s.match.blueTeamId, s.match.redTeamId].includes(t.id))];
  const group = id === 'identity' ? identity : id === 'data' ? [identity, s.activeSourceGameId, p.sourceEpoch, p.versions.game, p.versions.ocr] : id === 'program' ? [p.program?.version, s.programScene, p.application?.id] : id === 'game' ? [productionKey(s), s.settings.gamePath, p.sourceEpoch, p.versions.game] : id === 'audio' ? [productionKey(s), p.audioEpoch] : id === 'disk' ? [productionKey(s), p.diskEpoch] : [productionKey(s), p.program?.version];
  return JSON.stringify(group);
}
export const checkValid = (s: BroadcastState, id: CheckId) => s.production?.checks[id]?.fingerprint === checkFingerprint(s, id);
export function applyIdentity(s: BroadcastState, players: Player[]): Player[] {
  return players.map(player => {
    const team = s.teams.find(t => t.id === s.match[`${player.team}TeamId`]);
    const matches = team?.players.filter(p => p.account && (p.account === player.id.replace(/^(live|lcu)-/, '') || p.account === player.name)) ?? [];
    const member = matches.length === 1 ? matches[0] : undefined;
    const assignment = s.production?.assignments.find(a => a.playerId === player.id && a.team === player.team && a.locked);
    return { ...player, ...(member ? { name: member.name, role: member.role, portrait: member.portrait } : {}), ...(assignment ? { role: assignment.role } : {}) };
  });
}
export function dataHealth(s: BroadcastState, now = Date.now()) {
  const valid = (at?: string, expires?: string, max = 10000) => Number.isFinite(Date.parse(at ?? '')) && now - Date.parse(at!) >= -1000 && now - Date.parse(at!) < max && (!expires || Date.parse(expires) > now);
  return { stats: s.players.filter(p => p.statsAvailable !== false && (s.mode === 'demo' || valid(p.statsSampledAt, p.statsExpiresAt, 3000))).length,
    gold: s.players.filter(p => p.gold !== null && (s.mode === 'demo' || valid(p.goldSampledAt, p.goldExpiresAt))).length,
    roles: s.players.filter(p => !['', '待分路'].includes(p.role)).length, total: s.players.length,
    teamAge: s.economyFeed?.sampledAt ? Math.max(0, now - Date.parse(s.economyFeed.sampledAt)) : null };
}
