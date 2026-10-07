import type { BroadcastState, GameEvent, Side, Team } from '../../shared/types';
import { currentGameResult } from '../../shared/game-results';
import { getTeam } from '../lib';
import { GameTime } from './GameTime';
import './live-top.css';

type DragonKind = 'hextech' | 'infernal' | 'mountain' | 'ocean' | 'cloud' | 'chemtech' | 'elder' | 'unknown';
const emptyDragonSlots: DragonKind[] = ['hextech', 'infernal', 'mountain', 'ocean', 'cloud'];
const dragonLabels: Record<DragonKind, string> = { hextech: '海克斯亚龙', infernal: '炼狱亚龙', mountain: '山脉亚龙', ocean: '海洋亚龙', cloud: '云端亚龙', chemtech: '炼金亚龙', elder: '远古巨龙', unknown: '巨龙，类型未提供' };

function dragonKind(event?: GameEvent): DragonKind {
  const text = event?.text || '';
  if (/hextech|海克斯/i.test(text)) return 'hextech';
  if (/chemtech|炼金/i.test(text)) return 'chemtech';
  if (/infernal|fire|炼狱|火龙/i.test(text)) return 'infernal';
  if (/mountain|earth|山脉|土龙/i.test(text)) return 'mountain';
  if (/ocean|water|海洋|水龙/i.test(text)) return 'ocean';
  if (/cloud|air|云端|风龙/i.test(text)) return 'cloud';
  if (/elder|远古/i.test(text)) return 'elder';
  return 'unknown';
}

/** These vector glyphs follow the supplied broadcast reference; objective types come from game events. */
function DragonGlyph({ kind }: { kind: DragonKind }) {
  const paths: Record<DragonKind, string> = {
    hextech: 'M5 6h8v4H9v4H5V6Zm6 8h8V6h-4v4h-4v4ZM5 18h4v-2h4v4H5v-2Zm10-2h4v4h-4v-4Z',
    infernal: 'm12 2 1 9 4-6-1 9 4-4-2 8-6 4-6-4-2-8 4 4-1-9 4 6 1-9Z',
    mountain: 'M4 4h16v16H4V4Zm3 3v8L17 7H7Zm10 10v-8L7 17h10Z',
    ocean: 'M5 5h8v5H9v4H5V5Zm6 9h8V5h-4v5h-4v4ZM5 17h4v-2h4v5H5v-3Zm10-2h4v5h-4v-5Z',
    cloud: 'M3 6h8l-2 3-6-3Zm10 0h8l-6 3-2-3ZM9 10h6l-2 4v5l-1 3-1-3v-5l-2-4Zm-4 1 4 2-3 4-1-6Zm14 0-1 6-3-4 4-2Z',
    chemtech: 'M8 3h8v3h-2v5l5 8-2 2H7l-2-2 5-8V6H8V3Zm0 14h8l-3-5h-2l-3 5Z',
    elder: 'm3 4 6 2 3-4 3 4 6-2-3 8-3 1-3 9-3-9-3-1-3-8Zm6 4 3 3 3-3-3-2-3 2Z',
    unknown: 'm5 4 7 3 7-3-3 7-4 10-4-10-3-7Zm5 4 2 4 2-4-2 1-2-1Z',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fillRule="evenodd" d={paths[kind]} /></svg>;
}

function TowerGlyph() {
  return <svg viewBox="0 0 24 28" aria-hidden="true"><path fill="currentColor" d="m12 1 6 5-2 7-4 3-4-3-2-7 6-5Zm0 3-3 3 1 4 2 2 2-2 1-4-3-3ZM5 13l7 5 7-5-2 10-5 4-5-4-2-10Z" /></svg>;
}

function GoldGlyph() {
  return <svg viewBox="0 0 30 25" aria-hidden="true"><path fill="currentColor" d="M9 7C3 8 0 12 2 16c2 4 9 6 14 4 3-1 5-3 5-5-2 1-5 2-8 1-5-1-7-5-4-9Z" /><ellipse cx="19" cy="9" rx="9" ry="5.8" transform="rotate(-19 19 9)" fill="currentColor" /></svg>;
}

function LeagueGlyph() {
  return <svg viewBox="0 0 34 26" aria-hidden="true"><path fill="currentColor" d="M7 3h26l-8 19H1l6-6h15L7 3Zm4 3 15 12 3-12H11ZM4 10l14 4H1l3-4Z" /></svg>;
}

function NeutralGlyph() {
  return <svg viewBox="0 0 22 24" aria-hidden="true"><path fill="currentColor" d="m11 1 3 7-1 10-2 5-3-5-1-10 4-7ZM4 6l4 14-6-5-1-6 3-3Zm14 0 3 3-1 6-6 5 4-14Z" /></svg>;
}

function TeamIdentity({ team, side }: { team?: Team; side: Side }) {
  return <div className={`lt-team ${side}`} title={team?.name}>
    {team?.logo && <span className="lt-team-logo"><img src={team.logo} alt={`${team.name} 队标`} onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /></span>}
    <strong>{team?.tag || (side === 'blue' ? 'BLUE' : 'RED')}</strong>
  </div>;
}

function SeriesPips({ state, side }: { state: BroadcastState; side: Side }) {
  const bestOf = Number(state.match.format.match(/\d+/)?.[0]) || 3;
  const winsNeeded = Math.min(5, Math.floor(bestOf / 2) + 1);
  const wins = state.match[side === 'blue' ? 'blueScore' : 'redScore'];
  return <span className={`lt-series ${side}`} aria-label={`${side === 'blue' ? '蓝方' : '红方'}系列赛 ${wins} 胜`}>
    {Array.from({ length: winsNeeded }, (_, index) => <i key={index} className={index < wins ? 'won' : ''} />)}
  </span>;
}

function TeamResources({ state, side }: { state: BroadcastState; side: Side }) {
  const stats = state.stats[side];
  const connected = state.mode === 'demo' || !!currentGameResult(state) || state.connections.live.status === 'connected';
  return <div className={`lt-resources ${side}`}>
    <span className="lt-towers" title="摧毁防御塔"><TowerGlyph /><b>{connected&&stats.objectivesAvailable!==false ? stats.towers : '—'}</b></span>
    <span className="lt-gold" title={`团队经济：${stats.gold == null ? '未提供' : stats.gold}`}><GoldGlyph /><b>{stats.gold == null ? '—' : `${(stats.gold / 1000).toFixed(1)}K`}</b></span>
  </div>;
}

function DragonStrip({ state, side }: { state: BroadcastState; side: Side }) {
  const connected = state.mode === 'demo' || !!currentGameResult(state) || state.connections.live.status === 'connected';
  const kills = state.events.filter(event => event.type === 'DragonKill' && event.team === side && event.time <= state.gameTime + .25).sort((a, b) => a.time - b.time);
  const count = connected ? Math.max(0, state.stats[side].dragons) : 0;
  // Do not infer a dragon element from its ordinal position when the event did not provide it.
  const slots = Array.from({ length: Math.max(5, Math.min(8, count)) }, (_, index) => ({
    taken: index < count,
    kind: index < count ? dragonKind(kills[index]) : emptyDragonSlots[index % emptyDragonSlots.length],
  }));
  if(state.stats[side].objectivesAvailable===false)return <div className={`lt-dragons ${side}`} aria-label="巨龙事件未提供">—</div>;
  return <div className={`lt-dragons ${side}`} aria-label={`${side === 'blue' ? '蓝方' : '红方'}巨龙 ${connected ? count : '未提供'}`}>
    {slots.map((slot, index) => <span key={index} className={slot.taken ? 'taken' : ''} title={slot.taken ? dragonLabels[slot.kind] : '尚未获得巨龙'}><DragonGlyph kind={slot.kind} /></span>)}
  </div>;
}

export function LiveTop({ state }: { state: BroadcastState }) {
  const kills = (side: Side) => {
    const players = state.players.filter(player => player.team === side);
    return state.mode === 'live' && (!players.length || players.some(player => player.statsAvailable === false)) ? '—' : state.stats[side].kills;
  };
  return <section className="lt-scoreboard" aria-label="局内顶部计分板">
    <div className="lt-main">
      <SeriesPips state={state} side="blue" />
      <TeamIdentity team={getTeam(state, 'blue')} side="blue" />
      <TeamResources state={state} side="blue" />
      <div className="lt-kills" aria-label={`击杀 ${kills('blue')} 比 ${kills('red')}`}><strong>{kills('blue')}</strong><LeagueGlyph /><strong>{kills('red')}</strong></div>
      <TeamResources state={state} side="red" />
      <TeamIdentity team={getTeam(state, 'red')} side="red" />
      <SeriesPips state={state} side="red" />
    </div>
    <div className="lt-meta">
      {state.overlay.objectives && <DragonStrip state={state} side="blue" />}
      <div className="lt-clock"><strong><GameTime state={state} /></strong><NeutralGlyph /></div>
      {state.overlay.objectives && <DragonStrip state={state} side="red" />}
    </div>
  </section>;
}
