import {FitName} from '../FitName';
import type { BroadcastState, Champion, Side } from '../../../shared/types';
import { championFor, getTeam, time } from '../../lib';
import { ArenaHeader, ArenaMark, ChampionImage, MatchStrip, Portrait, TeamMark, TeamName, sideName, sidePlayers } from './ProgramPrimitives';

export function Standby({ state, now }: { state: BroadcastState; now: number }) {
  const end = state.overlay.countdownEnd;
  const counting = end != null && end > now;
  return <section className="arena-full cast-standby">
    <ArenaHeader state={state} title="赛前对阵" />
    <div className="arena-opener">
      <aside className="arena-start"><span>{counting ? '距离开场' : end ? '倒计时结束' : '开场时间待定'}</span><strong className={counting ? 'arena-countdown-number' : 'arena-countdown-message'}>{counting ? time(Math.ceil((end - now) / 1000)) : end ? '等待比赛开始' : '比赛即将开始'}</strong><p>{state.match.subtitle}</p><div><span>{state.match.format}</span><b>第 {state.match.game} 局</b></div></aside>
      <div className="arena-opponents">{(['blue', 'red'] as Side[]).map(side => <div key={side} className={`arena-opponent ${side}`}><small>{sideName(side)}</small><TeamMark team={getTeam(state, side)} /><TeamName team={getTeam(state, side)} side={side} /><b className="arena-opponent-score">{state.match[`${side}Score`]}<small>系列赛</small></b></div>)}</div>
    </div>
    <footer className="arena-footnote"><span>{state.match.title}</span><span>{'赛事对阵'}</span></footer>
  </section>;
}

function DraftHistory({ state, champions, side }: { state: BroadcastState; champions: Champion[]; side: Side }) {
  const teamId = state.match[`${side}TeamId`];
  const history = (state.draftHistory || []).filter(g => g.seriesId === state.match.seriesId && g.game < state.match.game && (g.blueTeamId === teamId || g.redTeamId === teamId));
  // Keep each team's picks on its current side, including after a side swap.
  const games = Array.from({ length: Math.max(0, state.match.game - 1) }, (_, i) => {
    const game = i + 1, record = history.find(g => g.game === game);
    return { game, current: false, picks: record ? (record.blueTeamId === teamId ? record.bluePicks : record.redPicks) : [] };
  });
  games.push({ game: state.match.game, current: true, picks: state.draft[`${side}Bans`] });
  return <div className={`cast-ban-history ${side}`} aria-label={`${sideName(side)}逐局禁用英雄`}>
    {games.map(({ game, current, picks }) => <div className={`cast-history-game ${current ? 'is-current' : 'is-history'}`} key={game} data-game={game} aria-label={`GAME${game} ${current ? '本局禁用' : '历史选用'}`}>
      <span>GAME{game}</span><div>{Array.from({ length: 5 }, (_, i) => <ChampionImage key={i} champions={champions} id={picks[i] || ''} />)}</div>
    </div>)}
  </div>;
}

function DraftTeam({ state, champions, side }: { state: BroadcastState; champions: Champion[]; side: Side }) {
  const picks = state.draft[`${side}Picks`], preselect = state.draft[`${side}Preselect`] || [];
  const assigned = (id: string) => (state.draft.locked || state.production?.assignments.some(a => a.locked && a.championId === id)) ? state.players.find(p => p.team === side && p.championId === id) : undefined;
  const choosing = !state.draft.locked && state.draft.activeTeam === side && !/ban|禁/i.test(state.draft.action);
  return <section className={`cast-draft-team ${side}`}>
    <div className="cast-draft-cards">{Array.from({ length: 5 }, (_, i) => {
      const active = choosing && !picks[i] && i === picks.filter(Boolean).length, hover = active ? preselect[0] : undefined, player = assigned(picks[i]);
      return <article className={`cast-draft-card ${picks[i] ? 'locked' : 'waiting'} ${active ? 'active-slot' : ''}`} data-state={picks[i] ? 'locked' : hover ? 'preselect' : active ? 'choosing' : 'waiting'} key={i}>
        <ChampionImage champions={champions} id={picks[i] || hover || ''} kind="splash" />
        <div className="arena-pick-identity"><FitName className="cast-draft-player">{player?.name || ''}</FitName></div>
      </article>;
    })}</div>
  </section>;
}

export function DraftOverlay({ state, champions }: { state: BroadcastState; champions: Champion[] }) {
  return <div className="cast-draft"><div className="arena-draft-history"><DraftHistory state={state} champions={champions} side="blue" /><span className="arena-draft-history-gap" /><DraftHistory state={state} champions={champions} side="red" /></div><div className="arena-draft-tray"><DraftTeam state={state} champions={champions} side="blue" /><aside className={`cast-draft-center ${state.draft.activeTeam}`}>
    <ArenaMark /><div className="arena-draft-match">{(['blue', 'red'] as Side[]).map(side => <div className={`arena-draft-center-team ${side}`} key={side}><TeamMark team={getTeam(state, side)} /><FitName>{getTeam(state, side)?.tag || sideName(side)}</FitName><b>{state.match[`${side}Score`]}</b></div>)}</div>
    {!state.draft.locked && <div className="cast-draft-timer"><strong>{Math.max(0, Math.ceil(state.draft.timer))}</strong></div>}
    <small>{state.match.format} · GAME{state.match.game}</small>
  </aside><DraftTeam state={state} champions={champions} side="red" /></div></div>;
}

export {Lineup} from './RuneLineup';
