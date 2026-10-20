import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, Player, Side, Team } from '../../../shared/types';
import { championArtwork } from '../../../shared/champion-art';
import { championFor, getTeam } from '../../lib';
import { dataDragonItemImage, type ItemAssets } from '../useItemCatalog';

export const laneNames = ['上单', '打野', '中单', '下路', '辅助'];
export const sideName = (side: Side) => side === 'blue' ? '蓝方' : '红方';
export function sidePlayers(state: BroadcastState, side: Side) {
  const order = (role: string) => laneNames.includes(role) ? laneNames.indexOf(role) : 5;
  return state.players.filter(p => p.team === side).sort((a, b) => order(a.role) - order(b.role)).slice(0, 5);
}
export function ChampionImage({ champions, id, kind = 'icon', art = 'draft', className = '' }: {
  champions: Champion[]; id: string; kind?: 'icon' | 'splash'; art?: 'draft' | 'lineup' | 'draftCompact' | 'draftExpanded' | 'draftReveal' | 'postgameMatchup'; className?: string;
}) {
  const champion = championFor(champions, id);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id, kind, art]);
  useEffect(()=>{
    if(champion&&kind==='splash'&&(art==='draftCompact'||art==='draftExpanded')){
      const next=new Image();next.src=championArtwork(champion,art==='draftCompact'?'draftExpanded':'draftCompact');
      const reveal=new Image();reveal.src=championArtwork(champion,'draftReveal');
    }
  },[champion?.id,kind,art]);
  return <div className={`champion-image ${className}`}>{champion && !failed
    ? <img loading={kind === 'splash' ? 'eager' : 'lazy'} src={kind === 'splash' ? championArtwork(champion, art) : champion.image} alt={champion.name} onError={() => setFailed(true)} />
    : <span className="champion-fallback">{champion?.name || (id ? '英雄图暂不可用' : '待定')}</span>}</div>;
}
export function TeamMark({ team }: { team?: Team }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [team?.logo]);
  return <span className="cast-team-mark" title={team?.name}>{team?.logo && !failed
    ? <img src={team.logo} onError={() => setFailed(true)} alt={`${team.name} 队标`} />
    : <b className="cast-team-initial" aria-label={team ? `${team.name} 无队标` : '战队待定'}>{team?.tag?.slice(0, 1) || '?'}</b>}</span>;
}
export function TeamName({ team, side }: { team?: Team; side: Side }) {
  return <span className={`arena-team-name ${side}`}><strong title={team?.name}>{team?.tag || sideName(side)}</strong><span>{team?.name || '战队待定'}</span></span>;
}
export function ArenaMark() {
  return <span className="arena-mark">RiftCast <b>ARENA</b></span>;
}
export function ArenaHeader({ state, title }: { state: BroadcastState; title: string }) {
  return <header className="arena-header"><ArenaMark /><div><span>{state.match.title}</span><h2>{title}</h2></div><span className="arena-game">{state.match.format}<b>第 {state.match.game} 局</b></span></header>;
}
export function MatchStrip({ state }: { state: BroadcastState }) {
  return <div className="arena-match-strip"><span className="blue">{getTeam(state, 'blue')?.tag || '蓝方'}</span><b>{state.match.blueScore} : {state.match.redScore}</b><span className="red">{getTeam(state, 'red')?.tag || '红方'}</span><small>系列赛比分</small></div>;
}
export function Portrait({ state, player, side, champions }: { state: BroadcastState; player?: Player; side: Side; champions: Champion[] }) {
  const team = getTeam(state, side);
  const url = player?.portrait || team?.players.find(p => p.name === player?.name)?.portrait || (player?.role && player.role !== '待分路' ? team?.players.find(p => p.role === player.role)?.portrait : undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed ? <img src={url} alt={`${player?.name || '首发'} 选手照片`} onError={() => setFailed(true)} />
    : <ChampionImage champions={champions} id={player?.championId || ''} kind="splash" art="lineup" />;
}
export function Equipment({ player, items, version }: { player?: Player; items: ItemAssets; version: string }) {
  const slots = player?.itemSlots || player?.items || [];
  return <div className="cast-equipment">{Array.from({ length: 7 }, (_, i) => {
    const id = slots[i] || 0, src = items[id]?.image || dataDragonItemImage(version, id);
    return <span key={i} className={i === 6 ? 'cast-trinket' : ''} title={id ? (items[id]?.name || `装备 ${id}`) : i === 6 ? '空饰品栏' : '空装备栏'}>{src && <img src={src} alt={items[id]?.name || (i === 6 ? '饰品' : '装备')} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} onLoad={e => { e.currentTarget.style.visibility = 'visible'; }} />}</span>;
  })}</div>;
}
