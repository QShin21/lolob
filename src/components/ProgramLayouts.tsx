import { StyleText } from './StyleText';
import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, Side } from '../../shared/types';
import { getTeam, playerCs, playerKda } from '../lib';
import { summonerSpellImage } from '../../shared/player-assets';
import { liveAnalysisReady } from '../../shared/broadcast-analysis';
import { telemetryFresh } from '../../shared/player-telemetry';
import { Icon, Meter } from './LiveBottom';
import { useGameClock } from './GameTime';
import { ChampionImage, TeamMark, sidePlayers } from './program/ProgramPrimitives';
import { dataDragonItemImage, type ItemAssets } from './useItemCatalog';
import './program-layouts.css';

export function FullHeightDraft({ state, champions }: { state: BroadcastState; champions: Champion[] }) {
  return <section className="full-height-draft" aria-label="全高 BP">
    <header><span>{state.match.title}</span><b>{state.match.blueScore} : {state.match.redScore}</b><span>{state.match.format} · 第 {state.match.game} 局</span></header>
    <div className="fhd-teams">{(['blue', 'red'] as Side[]).map(side => {
      const team = getTeam(state, side), picks = state.draft[`${side}Picks`];
      const active = !state.draft.locked && state.draft.activeTeam === side && /^(选择英雄|选人|pick|人工 BP)$/i.test(state.draft.action.trim());
      const activeSlot = active ? Array.from({ length: 5 }, (_, i) => i).find(i => !picks[i]) : undefined;
      return <section className={`fhd-team ${side}`} key={side}>
        <h2><TeamMark team={team}/><span>{team?.name || (side === 'blue' ? '蓝方' : '红方')}</span></h2>
        <div className="fhd-picks">{Array.from({ length: 5 }, (_, i) => {
          const choosing = i === activeSlot, id = picks[i] || (choosing ? state.draft[`${side}Preselect`]?.[0] : '') || '';
          const assigned = state.draft.locked || state.production?.assignments.some(a => a.locked && a.championId === id);
          const player = assigned && id ? state.players.find(p => p.team === side && p.championId === id) : undefined;
          return <article key={i} data-state={picks[i] ? 'locked' : choosing ? id ? 'preselect' : 'choosing' : 'waiting'}><ChampionImage champions={champions} id={id} kind="splash" art="postgameMatchup"/><strong><StyleText target="draftName" context={{player,team,championName:champions.find(c=>c.id===id)?.name??''}}>{player?.name || ''}</StyleText></strong></article>;
        })}</div>
        <div className="fhd-bans" aria-label={`${side === 'blue' ? '蓝' : '红'}方禁用`}>{Array.from({ length: 5 }, (_, i) => <ChampionImage key={i} champions={champions} id={state.draft[`${side}Bans`][i] || ''}/>)}</div>
      </section>;
    })}</div>
    {!state.draft.locked && <div className={`fhd-timer ${state.draft.activeTeam}`} aria-label="BP 倒计时">{Math.max(0, Math.ceil(state.draft.timer))}</div>}
    <footer>{state.match.subtitle}</footer>
  </section>;
}

export function ChampionTabs({ state, champions, version, items }: { state: BroadcastState; champions: Champion[]; version: string; items: ItemAssets }) {
  const time = useGameClock(state, true), [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  return <div className="champion-tabs" aria-label="双侧英雄状态栏">{(['blue', 'red'] as Side[]).map(side => <section className={`ct-team ${side}`} key={side}>{sidePlayers(state, side).map(player => {
    const live = liveAnalysisReady(state, now);
    const fresh = live && telemetryFresh(player.telemetry, time, now);
    const scores = live && player.statsAvailable !== false && (!player.statsExpiresAt || Date.parse(player.statsExpiresAt) > now) && (player.statsGameTime === undefined || Math.abs(player.statsGameTime - time) <= 2);
    const respawn = fresh && player.isDead ? player.respawnAt !== undefined ? Math.max(0, player.respawnAt - time) : player.respawnTimer : undefined;
    return <article key={player.id} className={fresh && player.isDead ? 'is-dead' : ''}>
      <div className="ct-portrait"><ChampionImage champions={champions} id={player.championId}/><b>{fresh ? player.level || '—' : '—'}</b>{fresh && player.isDead && <strong>{respawn !== undefined ? Math.ceil(respawn) : '—'}</strong>}</div>
      <div className="ct-details"><strong><StyleText target="championTabName" context={{player}}>{player.name}</StyleText></strong><Meter current={fresh ? player.health : undefined} max={player.maxHealth} kind="health" label="生命值"/><Meter current={fresh ? player.resource : undefined} max={player.maxResource} kind="resource" label="资源值"/>
        <div className="ct-spells"><Icon label="终极技能" missing="R" cooldown={player.ultimate || {state:'unknown'}} fresh={fresh} time={time}/>{Array.from({ length: 2 }, (_, i) => <Icon key={i} src={summonerSpellImage(player.summonerSpells?.[i], version)} label={player.summonerSpells?.[i]?.name || '召唤师技能未知'} missing="?" cooldown={player.summonerSpells?.[i]?.cooldown} fresh={fresh} time={time}/>)}</div>
        <small>{scores ? playerKda(player, true) : '—'} · {scores ? playerCs(player) : '—'} CS</small><div className="ct-items" aria-label="装备与饰品">{Array.from({length:7},(_,i)=>{const id=live?((player.itemSlots||player.items)[i]||0):0;return <Icon key={i} src={items[id]?.image||dataDragonItemImage(version,id)} label={!live?'装备数据待采集':id?(items[id]?.name||`装备 ${id}`):'空装备栏'} cooldown={player.itemCooldowns?.find(c=>c.slot===i&&c.itemId===id)?.cooldown} fresh={fresh} time={time}/>;})}</div>
      </div>
    </article>;
  })}</section>)}</div>;
}
