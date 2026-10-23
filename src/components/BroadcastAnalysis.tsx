import { StyleText } from './StyleText';
import { SkinDisplay } from './SkinDisplay';
import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, GameEvent, Side } from '../../shared/types';
import { analysisLabels, analysisModes, analysisRows, bestPartners, announcementEvent, inhibitorTimers, killFeedEvents, liveAnalysisReady, teamfightTimeline, type BroadcastAnalysisMode } from '../../shared/broadcast-analysis';
import { rankingGold } from '../../shared/gold-ranking';
import { powerPlayRows } from '../../shared/power-play';
import { championFor, getTeam, time } from '../lib';
import { useGameClock } from './GameTime';
import './broadcast-analysis.css';

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  return now;
}
const captions: Record<BroadcastAnalysisMode, string> = {
  off: '', 'gold-efficiency': '每花费 1,000 金币造成的英雄伤害 · 花费 = 累计金币 − 当前金币',
  participation: '参团率 =（击杀 + 助攻）÷ 本队击杀数', damage: '对英雄累计伤害', experience: '等级 · 当前等级经验进度',
  'damage-composition': '对英雄累计伤害构成 · 物理 / 魔法 / 真实伤害 · 三类数据完整时展示',
  'teamfight-timeline': '本段对英雄累计伤害 · 蓝 / 红方', 'skin-display': '当前对局皮肤',
};
function amount(mode: BroadcastAnalysisMode, value: number | null) {
  return value === null ? '—' : mode === 'participation' ? `${value.toFixed(1)}%` : mode === 'experience' ? `Lv ${value}` : Math.round(value).toLocaleString('en-US');
}
export function BroadcastAnalysis({ state, champions, mode }: { state: BroadcastState; champions: Champion[]; mode: BroadcastAnalysisMode }) {
  const now = useNow();
  if (mode === 'off') return null;
  if (mode === 'skin-display') return <SkinDisplay state={state} champions={champions} now={now}/>;
  const rows = analysisRows(state, mode, now), max = Math.max(1, ...rows.map(r => r.value ?? 0));
  const partners = mode === 'participation' ? bestPartners(state, now) : null;
  const timeline = mode === 'teamfight-timeline' ? teamfightTimeline(state, now) : null;
  return <section className={`broadcast-analysis analysis-${mode}`} aria-label={analysisLabels[mode]}>
    <header><strong>{analysisLabels[mode]}</strong><span>{time(state.gameTime)}</span></header>
    {mode === 'teamfight-timeline' ? <DamageTimeline timeline={timeline} state={state}/> : <div className="ba-columns">{(['blue', 'red'] as Side[]).map(side => <div className={`ba-column ${side}`} key={side}><h3>{getTeam(state, side)?.tag ?? side}</h3>{rows.filter(r => r.player.team === side).map(row => {
      const champion = championFor(champions, row.player.championId), width = mode === 'experience' ? row.secondary ?? 0 : mode === 'participation' ? row.value ?? 0 : (row.value ?? 0) / max * 100;
      return <article className="ba-player" key={row.player.id} data-player={row.player.id} data-available={row.value !== null}>
        <div className="ba-portrait">{champion && <img src={champion.image} alt={row.player.championName}/>}</div>
        <div className="ba-player-data"><div><strong><StyleText target="analysisName" context={{player:row.player}}>{row.player.name}</StyleText></strong><b><StyleText target="analysisValue" context={{player:row.player,value:amount(mode,row.value),label:analysisLabels[mode]}}>{amount(mode, row.value)}</StyleText></b></div>{mode === 'damage-composition' ? <><div className="ba-bar ba-composition-bar" aria-label="物理、魔法、真实伤害占比">{row.composition && (['physical', 'magic', 'true'] as const).map(kind => <i key={kind} className={kind} style={{ width: `${row.value ? row.composition![kind] / row.value * 100 : 0}%` }}/>)}</div><small className="ba-composition-values">{(['physical', 'magic', 'true'] as const).map(kind => <span key={kind} className={kind}>{{ physical: '物理', magic: '魔法', true: '真实' }[kind]} {row.composition ? Math.round(row.composition[kind]).toLocaleString('en-US') : '—'}</span>)}</small></> : <div className="ba-bar"><i style={{ width: `${Math.min(100, Math.max(0, width))}%` }}/></div>}
          {mode === 'gold-efficiency' && <small>已花费 {row.secondary === null ? '—' : Math.round(row.secondary ?? 0).toLocaleString('en-US')} 金币</small>}
          {mode === 'experience' && <small>经验 {row.secondary === null ? '—' : `${row.secondary?.toFixed(1)}%`}</small>}
        </div>
      </article>;
    })}</div>)}</div>}
    {partners&&<div className="ba-partners"><strong>最佳搭档 · 共同参与击杀</strong><span>{partners.pairs.slice(0,3).map(p=>`${p.first.name} + ${p.second.name} ${p.kills}次`).join(' · ')||'等待完整参与者事件'}</span><small>已采集 {partners.coveredKills} 次 · 名单缺失 {partners.unknownKills} 次</small></div>}
    <footer>{captions[mode]}{!liveAnalysisReady(state, now) && ' · 等待有效局内数据'}</footer>
  </section>;
}
function DamageTimeline({ timeline, state }: { timeline: ReturnType<typeof teamfightTimeline>; state: BroadcastState }) {
  if (!timeline) return <div className="ba-empty">切入团战视图开始记录；切回局内后可展示该段伤害时间线。</div>;
  const samples = state.fightSegment?.samples ?? [], maximum = Math.max(1, ...samples.flatMap(s => [s.blue ?? 0, s.red ?? 0]));
  const duration = Math.max(1, timeline.end - timeline.start), x = (t: number) => 60 + (t - timeline.start) / duration * 1180, y = (v: number) => 220 - v / maximum * 180;
  return <div className="ba-timeline"><div className="ba-timeline-summary"><span>{time(timeline.start)} — {time(timeline.end)}</span><strong>击杀 {timeline.kills.blue} : {timeline.kills.red}</strong><span>{timeline.active ? '正在记录' : '本段已结束'}</span></div>
    <svg viewBox="0 0 1280 270" role="img" aria-label="团战双方累计英雄伤害时间线，缺失样本区间留空">
      {[0, .5, 1].map(r => <g key={r}><line x1="60" x2="1240" y1={y(maximum * r)} y2={y(maximum * r)} stroke="currentColor" opacity=".2"/><text x="2" y={y(maximum * r) + 5} fill="currentColor" fontSize="16">{Math.round(maximum * r)}</text></g>)}
      {(['blue', 'red'] as Side[]).map(side => <g key={side} className={`ba-path ${side}`}>{samples.map((sample, i) => {
        const prev = samples[i - 1], a = prev?.[side], b = sample[side];
        return prev && a != null && b != null && sample.time - prev.time <= 2.5 ? <line key={i} x1={x(prev.time)} y1={y(a)} x2={x(sample.time)} y2={y(b)} strokeWidth="4"/> : b != null ? <circle key={i} cx={x(sample.time)} cy={y(b)} r="3"/> : null;
      })}</g>)}
      {[0, .25, .5, .75, 1].map(r => <text key={r} x={x(timeline.start + duration * r)} y="257" textAnchor="middle" fill="currentColor" fontSize="17">{time(timeline.start + duration * r)}</text>)}
      {timeline.events.map(e => <circle key={e.id} className={`ba-event-point ${e.team ?? 'unknown'}`} cx={x(e.time)} cy="232" r="5"><title>{time(e.time)} · {e.text}</title></circle>)}
    </svg>{!samples.some(s => s.blue !== null || s.red !== null) && <p>本段伤害样本等待采集</p>}
  </div>;
}
function eventName(state: BroadcastState, name: string | undefined) {
  return state.players.find(p => p.name === name || p.id === `live-${name}`)?.name ?? name ?? '';
}
function EventText({ state, event }: { state: BroadcastState; event: GameEvent }) {
  return <>{event.actor ? eventName(state, event.actor) : event.text}{event.victim && <> <span className="ba-kill-symbol">⚔</span> {eventName(state, event.victim)}</>}</>;
}
export function BroadcastEventLayer({ state, champions: _champions, killFeed = false, announcer = false, inhibitors = false }: { state: BroadcastState; champions?: Champion[]; killFeed?: boolean; announcer?: boolean; inhibitors?: boolean }) {
  const now = useNow(), gameTime = useGameClock(state, true), clockState = { ...state, gameTime };
  const kills = killFeed ? killFeedEvents(clockState, now) : [], announcement = announcer ? announcementEvent(clockState, now) : null, timers = inhibitors ? inhibitorTimers(clockState, now) : [];
  return <>
    {!!kills.length && <aside className="ba-kill-feed" aria-label="击杀播报">{kills.map(e => <div className={e.team ?? 'neutral'} key={e.id}><time>{time(e.time)}</time><div className="ba-kill-detail"><strong><EventText state={state} event={e}/></strong>{!!e.assistants?.length && <small className="ba-assistants">助攻 · {e.assistants.map(name => eventName(state, name)).join(' · ')}</small>}</div></div>)}</aside>}
    {announcement && <aside className={`ba-announcement ${announcement.event.team ?? 'neutral'}`} key={announcement.event.id} aria-label="赛事事件播报"><strong>{announcement.title}</strong><span><EventText state={state} event={announcement.event}/></span></aside>}
    {!!timers.length && <aside className="ba-inhibitors" aria-label="水晶复活倒计时">{timers.map(t => <div className={t.side} key={t.key}><span><StyleText target="inhibitorLabel" context={{player:undefined,team:getTeam(state,t.side),lane:{top:'上路',mid:'中路',bottom:'下路'}[t.lane],timer:time(t.remaining)}}>{getTeam(state, t.side)?.tag} · {{ top: '上路', mid: '中路', bottom: '下路' }[t.lane]}水晶</StyleText></span><b><StyleText target="inhibitorTime" context={{player:undefined,team:getTeam(state,t.side),lane:{top:'上路',mid:'中路',bottom:'下路'}[t.lane],timer:time(t.remaining)}}>{time(t.remaining)}</StyleText></b></div>)}</aside>}
  </>;
}
export function GlobalScoreboard({ state }: { state: BroadcastState }) {
  const now = useNow(), gameTime = useGameClock(state), ready = liveAnalysisReady(state, now);
  const powerPlays = powerPlayRows(state, now);
  return <section className="ba-global-scoreboard" aria-label="完整顶部计分板">{(['blue', 'red'] as Side[]).map(side => {
    const roster = state.players.filter(p => p.team === side), values = roster.map(p => rankingGold(state, p, now));
    const gold = ready && roster.length === 5 && values.every(v => v !== null) ? values.reduce<number>((sum, v) => sum + v!, 0) : null;
    const stats = state.stats[side], objectives = ready && stats.objectivesAvailable === true && (!stats.objectivesExpiresAt || Date.parse(stats.objectivesExpiresAt) > now);
    return <div className={`ba-global-team ${side}`} key={side}><strong>{getTeam(state, side)?.tag ?? side}</strong><span>胜 {state.match[`${side}Score`]}</span><b>{ready && roster.length === 5 && roster.every(p => p.statsAvailable !== false) ? roster.reduce((sum, p) => sum + p.kills, 0) : '—'}</b><span>经济 <em>{gold === null ? '—' : `${(gold / 1000).toFixed(1)}k`}</em></span><span>塔 {objectives ? stats.towers : '—'}</span><span>龙 {objectives ? stats.dragons : '—'}</span></div>;
  })}<time>{time(gameTime)}</time>{powerPlays.length > 0 && <div className="ba-power-plays" aria-label="资源增益经济收益">{powerPlays.map(row => <div className={row.side} key={row.id} title={row.reason || `收益 = 本队金币增长 − 对方金币增长；起点采样 ${time(row.baseline!.time)}`}><strong>{getTeam(state,row.side)?.tag} · {row.kind === 'baron' ? '男爵' : '远古龙'} POWER PLAY</strong><b>{row.value === null ? '—' : `${row.value >= 0 ? '+' : '−'}${Math.round(Math.abs(row.value)).toLocaleString('en-US')}`}</b><span>{row.value === null ? '采样不完整' : '净经济收益'}{row.expiresAt ? ` · ${time(Math.max(0,row.expiresAt-gameTime))}` : ''}</span></div>)}</div>}</section>;
}
export function LiveLFrame({ state, champions }: { state: BroadcastState; champions: Champion[] }) {
  const now = useNow(), gameTime = useGameClock(state), ready = liveAnalysisReady(state, now);
  return <section className="live-l-frame" aria-label="L 形转播构图">
    <aside className="llf-rosters">{(['blue', 'red'] as Side[]).map(side => <div className={`llf-team ${side}`} key={side}><header><strong>{getTeam(state, side)?.tag ?? side}</strong><b>{ready ? state.stats[side].kills : '—'}</b></header>{state.players.filter(p => p.team === side).slice(0, 5).map(p => {
      const c = championFor(champions, p.championId), gold = ready ? rankingGold(state, p, now) : null;
      return <article key={p.id}>{c && <img src={c.image} alt={c.name}/>}<div><strong><StyleText target="lFrameName" context={{player:p}}>{p.name}</StyleText></strong><small>{ready && p.statsAvailable !== false ? `${p.kills} / ${p.deaths} / ${p.assists}` : '—'}</small></div><span>{gold === null ? '—' : `${(gold / 1000).toFixed(1)}k`}</span></article>;
    })}</div>)}</aside>
    <footer className="llf-footer"><div><strong><StyleText target="lFrameFooter">{state.match.title}</StyleText></strong><span>{state.match.subtitle || state.match.format}</span></div><div className="llf-series"><strong>{getTeam(state, 'blue')?.tag}</strong><b>{state.match.blueScore} : {state.match.redScore}</b><strong>{getTeam(state, 'red')?.tag}</strong></div><div><time>{time(gameTime)}</time><span>GAME {state.match.game}</span></div>{state.overlay.sponsorLogo ? <img src={state.overlay.sponsorLogo} alt={state.overlay.sponsor}/> : <strong className="llf-sponsor">{state.overlay.sponsor}</strong>}</footer>
  </section>;
}
export interface BroadcastAnalysisControlsProps {
  mode: BroadcastAnalysisMode; onModeChange: (mode: BroadcastAnalysisMode) => void;
  killFeed: boolean; onKillFeedChange: (value: boolean) => void;
  announcer: boolean; onAnnouncerChange: (value: boolean) => void;
  inhibitors: boolean; onInhibitorsChange: (value: boolean) => void;
  disabled?: boolean; onGoldGraph?: () => void;
}
export function BroadcastAnalysisControls(props: BroadcastAnalysisControlsProps) {
  return <section className="panel broadcast-analysis-controls"><div className="panel-head"><h2>局内分析与事件图层</h2></div><fieldset disabled={props.disabled}>
    <label>分析面板<select aria-label="局内分析面板" value={props.mode} onChange={e => props.onModeChange(e.target.value as BroadcastAnalysisMode)}>{analysisModes.map(mode => <option key={mode} value={mode}>{analysisLabels[mode]}</option>)}</select></label>
    {props.onGoldGraph && <button className="button small" type="button" onClick={props.onGoldGraph}>预监经济曲线</button>}
    <div className="ba-switches"><label><input type="checkbox" checked={props.killFeed} onChange={e => props.onKillFeedChange(e.target.checked)}/>击杀播报</label><label><input type="checkbox" checked={props.announcer} onChange={e => props.onAnnouncerChange(e.target.checked)}/>事件公告</label><label><input type="checkbox" checked={props.inhibitors} onChange={e => props.onInhibitorsChange(e.target.checked)}/>水晶复活计时</label></div>
    <p className="muted">分析面板共用下方区域。切入团战视图开始记录伤害时间线；水晶计时跟随有效摧毁事件。</p>
  </fieldset></section>;
}
