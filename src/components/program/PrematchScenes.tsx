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
    <footer className="arena-footnote"><span>{state.match.title}</span><span>{state.mode === 'demo' ? '演示对局' : '赛事对阵'}</span></footer>
  </section>;
}

function DraftHistory({ state, champions, side }: { state: BroadcastState; champions: Champion[]; side: Side }) {
  const teamId = state.match[`${side}TeamId`];
  const history = (state.draftHistory || []).filter(g => g.seriesId === state.match.seriesId && g.game < state.match.game && (g.blueTeamId === teamId || g.redTeamId === teamId));
  const slots = Math.min(4, Math.max(0, Number(state.match.format.replace('BO', '')) - 1));
  return <div className={`cast-ban-history ${side}`} aria-label={`${sideName(side)}全局 BP 历史`}><div className="arena-history-heading"><strong>{getTeam(state, side)?.tag || sideName(side)}</strong><span>{state.production?.rules.mode === 'standard' ? '本系列已用英雄' : '本系列禁选历史'}</span></div><div className="arena-history-games">{Array.from({ length: slots }, (_, i) => {
    const game = i + 1, record = history.find(g => g.game === game), picks = record ? (record.blueTeamId === teamId ? record.bluePicks : record.redPicks) : [];
    return <div className={`cast-history-game ${record ? '' : 'is-pending'} ${state.production?.rules.mode === 'standard' ? 'is-standard' : ''}`} key={game}><span>第 {game} 局 <small>{record ? '已归档' : game === state.match.game ? '本局' : game > state.match.game ? '待进行' : '未归档'}</small></span><div>{Array.from({ length: 5 }, (_, j) => <ChampionImage key={j} champions={champions} id={picks[j] || ''} />)}</div></div>;
  })}</div></div>;
}

function DraftTeam({ state, champions, side }: { state: BroadcastState; champions: Champion[]; side: Side }) {
  const picks = state.draft[`${side}Picks`], bans = state.draft[`${side}Bans`], preselect = state.draft[`${side}Preselect`] || [];
  const assigned = (id: string) => (state.draft.locked || state.production?.assignments.some(a => a.locked && a.championId === id)) ? state.players.find(p => p.team === side && p.championId === id && p.role !== '待分路') : undefined;
  const choosing = !state.draft.locked && state.draft.activeTeam === side && !/ban|禁/i.test(state.draft.action);
  const team = getTeam(state, side);
  return <section className={`cast-draft-team ${side}`}><header className="arena-draft-team-heading"><TeamMark team={team} /><strong title={team?.name}>{team?.tag || sideName(side)}</strong><span>{sideName(side)}</span><div className="cast-bans"><small>本局禁用</small>{Array.from({ length: 5 }, (_, i) => <ChampionImage key={i} champions={champions} id={bans[i] || ''} />)}</div></header>
    <div className="cast-draft-cards">{Array.from({ length: 5 }, (_, i) => {
      const active = choosing && !picks[i] && i === picks.filter(Boolean).length, hover = active ? preselect[0] : undefined, player = assigned(picks[i]);
      return <article className={`cast-draft-card ${picks[i] ? 'locked' : 'waiting'} ${active ? 'active-slot' : ''}`} key={i}><ChampionImage champions={champions} id={picks[i] || hover || ''} kind="splash" /><span className="cast-pick-order">{side === 'blue' ? 'B' : 'R'}{i + 1}</span><small className="arena-pick-state">{picks[i] ? '已锁定' : hover ? '预选 · 未锁定' : active ? '正在选择' : '待选择'}</small><div className="arena-pick-identity"><span className="cast-draft-role">{player?.role || '归属待确认'}</span><strong className="cast-draft-player">{player?.name || `${side === 'blue' ? 'B' : 'R'}${i + 1} · 选择顺序`}</strong><span className="cast-draft-champion">{championFor(champions, picks[i])?.name || (hover ? `${championFor(champions, hover)?.name || hover}（预选）` : '等待选择')}</span></div></article>;
    })}</div>{preselect.length > 0 && <div className="cast-draft-preselect">预选未锁定：{preselect.map(id => championFor(champions, id)?.name || id).join(' / ')}</div>}
  </section>;
}

export function DraftOverlay({ state, champions }: { state: BroadcastState; champions: Champion[] }) {
  return <div className="cast-draft"><div className="arena-draft-history"><DraftHistory state={state} champions={champions} side="blue" /><span className="arena-draft-history-gap" /><DraftHistory state={state} champions={champions} side="red" /></div><div className="arena-draft-tray"><DraftTeam state={state} champions={champions} side="blue" /><aside className={`cast-draft-center ${state.draft.activeTeam}`}><ArenaMark /><MatchStrip state={state} /><div className="cast-draft-timer"><strong>{Math.max(0, Math.ceil(state.draft.timer))}</strong><small>{state.draft.locked ? '阵容已锁定' : state.draft.action || '等待 BP'}</small><span>{getTeam(state, state.draft.activeTeam)?.tag || sideName(state.draft.activeTeam)}</span></div><small>{state.match.format} · 第 {state.match.game} 局</small></aside><DraftTeam state={state} champions={champions} side="red" /></div></div>;
}

export function Lineup({ state, champions }: { state: BroadcastState; champions: Champion[] }) {
  const blue = sidePlayers(state, 'blue'), red = sidePlayers(state, 'red');
  return <section className="arena-full cast-lineup"><ArenaHeader state={state} title="首发对位" /><div className="arena-lineup-identity"><div className="blue"><TeamMark team={getTeam(state, 'blue')} /><TeamName team={getTeam(state, 'blue')} side="blue" /></div><MatchStrip state={state} /><div className="red"><TeamName team={getTeam(state, 'red')} side="red" /><TeamMark team={getTeam(state, 'red')} /></div></div>
    <div className="arena-lineup-matchups">{Array.from({ length: 5 }, (_, i) => <div className="arena-lineup-pair" key={i}>{(['blue', 'red'] as Side[]).map((side, index) => {
      const p = (side === 'blue' ? blue : red)[i], role = blue[i]?.role === red[i]?.role && blue[i]?.role !== '待分路' ? blue[i]?.role : '分路待确认';
      return <div key={side} className={`arena-lineup-half ${side}`}>{index === 1 && <div className="arena-matchup-role">{role || '分路待确认'}</div>}<article data-side={side}><div className="cast-lineup-photo"><Portrait state={state} player={p} side={side} champions={champions} /></div><div className="arena-lineup-player"><strong>{p?.name || '选手待确认'}</strong><small>{championFor(champions, p?.championId || '')?.name || '英雄待定'}</small></div></article></div>;
    })}</div>)}</div><footer className="arena-footnote"><span>首发阵容</span><span>{state.match.subtitle}</span></footer></section>;
}
