import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, Player } from '../../shared/types';
import type { NeutralKind } from '../../shared/combat-display';
import { liveDamage } from '../../shared/combat-display';
import { productionKey } from '../../shared/production';
import { telemetryFresh, activeBuffs } from '../../shared/player-telemetry';
import { summonerSpellImage } from '../../shared/player-assets';
import { bottomPlayers } from '../../server/bottom-scoreboard';
import { championFor } from '../lib';
import { useGameClock } from './GameTime';
import { useUltimateIcons } from './useUltimateIcons';
import { Icon, Meter, PlayerFeed } from './LiveBottom';
import './combat-overlay.css';

const labels:Record<NeutralKind,string>={grubs:'虚空巢虫',herald:'峡谷先锋',baron:'纳什男爵',dragon:'元素亚龙',elder:'远古巨龙'};
const elements:Record<string,string>={air:'风',earth:'山脉',fire:'炼狱',water:'海洋',hextech:'海克斯',chemtech:'炼金'};
function ObjectiveIcon({kind,element}:{kind:NeutralKind;element?:string}){
 const path=kind==='grubs'?'M16 3 21 8 28 10 25 17 26 23 20 25 16 30 12 25 6 23 7 17 4 10 11 8Z':kind==='herald'?'M5 3 9 11 4 18 10 28 22 28 28 18 23 11 27 3 20 8 12 8Z':kind==='baron'?'M3 5 11 10 16 3 21 10 29 5 26 23 16 30 6 23Z':'M9 3 13 12 16 6 19 12 23 3 29 19 22 28 16 23 10 28 3 19Z';
 return <svg viewBox="0 0 32 32" aria-hidden="true"><path d={path} fill="currentColor"/><path d="M10 16 14 18 12 21ZM22 16 18 18 20 21Z" fill="#101820"/>{kind==='dragon'&&element&&<path d="M16 12 18 17 16 21 14 17Z" fill="#101820"/>}</svg>;
}
function useWallClock(){const [now,setNow]=useState(Date.now);useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[]);return now;}
export function NeutralTimers({state}:{state:BroadcastState}){
 const time=useGameClock(state,true),now=useWallClock(),sample=state.neutralObjectives;
 const fresh=sample&&telemetryFresh({...sample,source:'api'},time,now)&&state.connections.live.status==='connected'&&!state.gameClock?.awaitingLiveSample;
 const objectives=sample?.objectives??[{kind:'baron' as const,state:'unknown' as const},{kind:'dragon' as const,state:'unknown' as const}];
 return <section className="neutral-timers" aria-label="中立资源状态与倒计时">{objectives.map(o=>{
   const remaining=fresh&&o.dueAt!==undefined?Math.max(0,Math.ceil(o.dueAt-time)):undefined;
   const status=!fresh||o.state==='unknown'?'unknown':remaining!==undefined&&remaining>0?'countdown':'alive';
   const label=o.kind==='dragon'&&o.element?`${elements[o.element]??''}亚龙`:labels[o.kind];
   return <div key={o.kind} className={`neutral-objective ${o.kind} element-${o.element??'unknown'} ${status}`} data-kind={o.kind} data-state={status} title={`${label} · ${status==='alive'?'已刷新':status==='unknown'?'等待数据':'刷新倒计时'}`}>
     <span className="neutral-icon"><ObjectiveIcon kind={o.kind} element={o.element}/></span>
     {status!=='alive'&&<b>{status==='unknown'?'—':`${Math.floor(remaining!/60)}:${String(remaining!%60).padStart(2,'0')}`}</b>}
   </div>;
 })}</section>;
}
export function TeamfightOverlay({state,champions,version}:{state:BroadcastState;champions:Champion[];version:string}){
 const time=useGameClock(state,true),now=useWallClock();
 const icons=useUltimateIcons(version,state.players.map(p=>p.championId));
 const segment=state.fightSegment?.key===productionKey(state)&&state.fightSegment.active?state.fightSegment:undefined;
 const render=(player:Player|undefined,index:number)=>{
  const champion=championFor(champions,player?.championId??'');
  const fresh=state.connections.live.status==='connected'&&!state.gameClock?.awaitingLiveSample&&telemetryFresh(player?.telemetry,time,now);
  const buffs=activeBuffs(player?.buffs,time,fresh,!!player?.isDead),row=player&&segment?.players[player.id];
  const damage=player&&row&&!row.invalid&&liveDamage(player,state,now)!==undefined?row.total:undefined;
  const respawn=fresh&&player?.isDead&&player.respawnAt!==undefined?Math.max(0,Math.ceil(player.respawnAt-time)):undefined;
  return <article key={player?.id??index} className={`tf-player ${player?.team??'blue'} ${fresh&&player?.isDead?'is-dead':''}`} data-player={player?.id}>
   <div className="tf-ultimate"><Icon src={player?.ultimate?.icon||icons[player?.championId??'']} label="终极技能" missing="R" cooldown={player?.ultimate??{state:'unknown'}} time={time} fresh={fresh}/></div>
   <div className="tf-spells">{[0,1].map(i=><Icon key={i} src={summonerSpellImage(player?.summonerSpells?.[i],version)} label="召唤师技能" missing="?" cooldown={player?.summonerSpells?.[i]?.cooldown} time={time} fresh={fresh}/>)}</div>
   <div className={`tf-portrait ${buffs.baron?'has-baron':''} ${buffs.elder?'has-elder':''}`}>
    {champion&&<img src={champion.image} alt={player?.name||champion.name}/>}
    <b className="tf-level">{player?.level??'—'}</b>{fresh&&player?.isDead&&<strong className="tf-respawn">{respawn||'—'}</strong>}
   </div>
   <div className="tf-vitals"><Meter current={fresh?player?.experience:undefined} max={player?.maxExperience} kind="experience" label="当前等级经验"/><Meter current={fresh?player?.health:undefined} max={player?.maxHealth} kind="health" label="生命值"/><Meter current={fresh?player?.resource:undefined} max={player?.maxResource} kind={`resource ${player?.resourceType?.toLowerCase()??'mana'}`} label="资源值"/></div>
   <div className="tf-damage" aria-label={`${player?.name??'选手'} 本段对英雄伤害`} data-available={damage!==undefined}><b>{damage===undefined?'—':damage.toLocaleString('en-US')}</b></div>
  </article>;
 };
 return <div className="teamfight-overlay"><PlayerFeed state={state} side="blue"/><PlayerFeed state={state} side="red"/>
  <section className="tf-panel" aria-label="团战十人状态与本段伤害"><header>本段对英雄伤害 <span>{segment?`${Math.max(0,Math.floor(time-segment.startedAt))}s`:'切入后开始统计'}</span></header>
   <div className="tf-roster">{(['blue','red'] as const).map(side=><div className={`tf-team ${side}`} key={side}>{Array.from({length:5},(_,i)=>render(bottomPlayers(state,side)[side==='blue'?4-i:i],i))}</div>)}</div>
  </section>
 </div>;
}
