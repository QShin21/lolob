import type { BroadcastState } from '../shared/types';
import { resolveAutomaticSides } from '../shared/player-identity';
import { ensureProduction, preserveProgram } from '../shared/production';
import { audit } from './production';

/** Call on a fresh, accepted live sample, before overwriting the prior roster. */
export function applyAutomaticSides(state:BroadcastState,rawPlayers:unknown){
  const result=resolveAutomaticSides(state,rawPlayers);if(result.status!=='swap')return result;
  preserveProgram(state);
  const p=ensureProduction(state),blueScore=state.match.blueScore,redScore=state.match.redScore;
  state.match.blueTeamId=result.blueTeamId;state.match.redTeamId=result.redTeamId;
  state.match.blueScore=p.scores[result.blueTeamId]??redScore;state.match.redScore=p.scores[result.redTeamId]??blueScore;
  p.assignments=[];p.checks={};p.configVersion++;
  audit(state,'automatic-sides','客户端名单',`${result.reason}（蓝 ${result.matches.blue} / 红 ${result.matches.red}）`);
  return result;
}
