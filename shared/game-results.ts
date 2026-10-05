import type { BroadcastState, GameResult, Player } from './types';

export function gameResultKey(state: Pick<BroadcastState,'mode'|'match'>): string {
  return JSON.stringify([state.mode,state.match.seriesId||state.match.title,state.match.game,[state.match.blueTeamId,state.match.redTeamId].sort()]);
}
export function rosterFingerprint(players: Player[]): string {
  return JSON.stringify(players.map(p=>[p.id,p.team,p.championId]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
}
export function currentGameResult(state: BroadcastState): GameResult | undefined {
  return state.gameResults?.find(result=>result.id===state.finishedGameId && result.key===gameResultKey(state));
}
export function reportGameResult(state: BroadcastState): GameResult | undefined {
  return state.gameResults?.find(result=>result.id===state.reportGameId&&result.seriesId===state.match.seriesId&&result.snapshot.mode===state.mode);
}
export function gameResultAwaitingTerminalSample(result?: GameResult): boolean {
  return result?.source==='lcu'&&result.terminalSampleAccepted!==true;
}
/** A detached postgame view keeps observed data independent of client disconnects and future samples. */
export function frozenGameState(state: BroadcastState, result=currentGameResult(state)): BroadcastState {
  if(!result)return state;
  const view={...state,finishedGameId:result.id,mode:result.snapshot.mode,phase:'postgame' as const,match:structuredClone(result.match),teams:structuredClone(result.teams),players:structuredClone(result.snapshot.players),stats:structuredClone(result.snapshot.stats),events:structuredClone(result.snapshot.events),economy:structuredClone(result.snapshot.economy),draft:structuredClone(result.draft),gameTime:result.snapshot.duration,paused:true,economyFeed:result.snapshot.economyFeed?structuredClone(result.snapshot.economyFeed):undefined};
  delete view.gameClock;
  delete view.awaitingNextGame;
  if(gameResultKey(state)!==result.key)view.selectedPlayerId=result.selectedPlayerId??null;
  return view;
}
