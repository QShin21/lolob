import type { BroadcastState } from '../../../shared/types';
import { getTeam } from '../../lib';
import { ArenaMark } from './ProgramPrimitives';
import { StyleText } from '../StyleText';

export function Interview({ state }: { state: BroadcastState }) {
  const player = state.players.find(p => p.id === state.selectedPlayerId), team = player ? getTeam(state, player.team) : undefined, info = state.overlay.interview;
  return <section className={`cast-interview dock-${info?.dock ?? 'left'}`} aria-label="采访名牌"><div className="arena-interview-identity"><ArenaMark /><span>{state.match.format} · 第 {state.match.game} 局</span></div><div className="cast-interview-name"><small>{info?.topic || '赛后采访'}</small><strong><StyleText target="interviewName" context={{player,team}}>{info ? info.name || '赛后采访' : player?.name || '赛后采访'}</StyleText></strong><span>{info ? [info.team, info.role].filter(Boolean).join(' · ') : [team?.name, player?.role].filter(Boolean).join(' · ') || state.match.title}</span></div></section>;
}
