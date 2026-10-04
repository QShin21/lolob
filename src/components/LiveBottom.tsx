import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, Player, Side } from '../../shared/types';
import { runeImage, summonerSpellImage } from '../../shared/player-assets';
import { bottomGoldDifference, bottomItemSlots, bottomPlayers } from '../../server/bottom-scoreboard';
import { championFor, getTeam, playerCs, playerKda } from '../lib';
import { dataDragonItemImage, type ItemAssets } from './useItemCatalog';
import { useUltimateIcons } from './useUltimateIcons';
import './live-bottom.css';

function Icon({src,label,missing='',className=''}:{src?:string;label:string;missing?:string;className?:string}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return <span className={`lb-icon ${className} ${!src||failed?'is-unavailable':''}`} title={failed?`${label} · 图标加载失败`:label}>
    {src&&!failed?<img src={src} alt={label} onError={()=>setFailed(true)}/>:missing&&<span className="lb-icon-fallback">{missing}</span>}
  </span>;
}
function Spells({player,version}:{player?:Player;version:string}) {
  return <div className="lb-spells" aria-label="召唤师技能">{Array.from({length:2},(_,i)=>{
    const spell=player?.summonerSpells?.[i];
    return <Icon key={i} src={summonerSpellImage(spell,version)} label={spell?.name||'召唤师技能未提供'} missing="?"/>;
  })}</div>;
}
function Runes({player}:{player?:Player}) {
  const keystone=player?.runeSelection?.keystoneId??player?.runeIds?.[0];
  const secondary=player?.runeSelection?.secondaryTreeId??(player?.runeIds&&player.runeIds.length>=3?player.runeIds[2]:undefined);
  return <div className="lb-runes" aria-label="主符文与副系">
    <Icon src={runeImage(keystone)} label={keystone?`主符文 ${keystone}`:'主符文未提供'} missing="?"/>
    <Icon src={runeImage(secondary)} label={secondary?`副系符文 ${secondary}`:'副系符文未提供'} missing="?"/>
  </div>;
}
function Meter({current,max,kind,label}:{current?:number;max?:number;kind:string;label:string}) {
  const available=current!=null&&Number.isFinite(current)&&max!=null&&Number.isFinite(max)&&max>0;
  const percentage=available?Math.max(0,Math.min(100,current!/max!*100)):0;
  return <span className={`lb-meter ${kind} ${available?'':'is-unavailable'}`} title={available?`${label} ${Math.round(current!)} / ${Math.round(max!)}`:`${label}未提供`} aria-label={available?`${label} ${Math.round(percentage)}%`:`${label}未提供`}>
    <i style={{width:`${percentage}%`}}/>
  </span>;
}
function Identity({player,ultimateIcon}:{player?:Player;ultimateIcon?:string}) {
  const ultimate=player?.ultimate,state=ultimate?.state||'unknown';
  const status=state==='ready'?'终极技能就绪':state==='unlearned'?'终极技能尚未学习':state==='cooldown'?`终极技能冷却${ultimate?.cooldownRemaining!=null?` ${Math.ceil(ultimate.cooldownRemaining)} 秒`:''}`:'终极技能状态未提供';
  return <div className="lb-identity">
    <div className="lb-identity-line">
      <span className={`lb-ultimate ${state}`} title={status} aria-label={status}>
        <Icon src={ultimate?.icon||ultimateIcon} label="终极技能" missing="R"/>
        {state==='cooldown'&&ultimate?.cooldownRemaining!=null&&<b>{Math.ceil(ultimate.cooldownRemaining)}</b>}
      </span>
      <strong className="lb-player-name" title={player?.name}>{player?.name||'—'}</strong>
    </div>
    <div className="lb-vitals">
      <Meter current={player?.experience} max={player?.maxExperience} kind="experience" label="当前等级经验"/>
      <Meter current={player?.health} max={player?.maxHealth} kind="health" label="生命值"/>
      <Meter current={player?.resource} max={player?.maxResource} kind={`resource ${(player?.resourceType||'mana').toLowerCase()}`} label="资源值"/>
    </div>
  </div>;
}
function Inventory({player,items,version}:{player?:Player;items:ItemAssets;version:string}) {
  const slots=bottomItemSlots(player),quest=player?.roleQuest;
  const itemIcon=(id:number,slot:number)=><span className="lb-item-slot" key={slot}>
    <Icon src={items[id]?.image||dataDragonItemImage(version,id)} label={id?(items[id]?.name||`装备 ${id}`):'空装备栏'}/>
    {player?.itemCounts?.[slot]!=null&&player.itemCounts[slot]>1&&<b className="lb-item-count">{player.itemCounts[slot]}</b>}
  </span>;
  const questKnown=quest?.completed!=null;
  const questLabel=questKnown?`分路任务${quest?.completed?'已完成':'进行中'}${quest?.progress!=null?` ${quest.progress}${quest.maxProgress!=null?` / ${quest.maxProgress}`:''}`:''}`:'分路任务状态未提供';
  return <div className="lb-inventory" aria-label="装备、分路任务与饰品">
    <div className="lb-items">{slots.slice(0,6).map(itemIcon)}</div>
    <div className={`lb-quest ${questKnown?quest?.completed?'is-complete':'is-pending':'is-unavailable'}`} aria-label={questLabel} title={questLabel}>
      {quest?.icon?<Icon src={quest.icon} label={questLabel}/>:<span className="lb-quest-mark">{questKnown?quest?.completed?'✓':'◇':'?'}</span>}
    </div>
    <div className="lb-trinket" title={player?.visionScore!=null?`视野得分 ${player.visionScore}`:'视野得分未提供'}>
      <span className="lb-vision-score">{player?.visionScore!=null?Math.round(player.visionScore):'—'}</span>
      <Icon src={items[slots[6]]?.image||dataDragonItemImage(version,slots[6])} label={slots[6]?(items[slots[6]]?.name||'饰品'):'空饰品栏'}/>
    </div>
  </div>;
}
function PlayerRow({player,champions,items,version,side,ultimateIcon}:{player?:Player;champions:Champion[];items:ItemAssets;version:string;side:Side;ultimateIcon?:string}) {
  const champion=championFor(champions,player?.championId||'');
  return <div className={`lb-player-row ${side} ${player?.isDead?'is-dead':''}`} aria-label={`${player?.name||'等待选手'} 英雄、状态、装备、KDA 与补刀`}>
    <Inventory player={player} items={items} version={version}/><Runes player={player}/><Spells player={player} version={version}/>
    <div className="lb-champion" title={`${player?.name||'等待选手'} · ${champion?.name||'英雄待定'}`}>
      {champion&&<img src={champion.image} alt={champion.name}/>}
      <b className="lb-level">{player?.level&&player.level>0?player.level:'—'}</b>
      {player?.isDead&&player.respawnTimer!=null&&player.respawnTimer>0&&<span className="lb-respawn">{Math.ceil(player.respawnTimer)}</span>}
    </div>
    <Identity player={player} ultimateIcon={ultimateIcon}/>
    <div className="lb-stat-column"><b className="lb-cs">{playerCs(player)}</b><b className="lb-kda">{playerKda(player,true)}</b></div>
  </div>;
}
function PlayerFeed({state,side}:{state:BroadcastState;side:Side}) {
  const feed=state.overlay.playerFeeds?.[side],player=bottomPlayers(state,side)[1];
  if(feed?.mode==='off')return null;
  const label=feed?.label||player?.name||getTeam(state,side)?.players[1]?.name||'';
  return <div className={`lb-feed ${side} ${feed?.mode==='camera'?'is-camera':'is-image'}`} aria-label={`${side==='blue'?'蓝':'红'}方选手画面`}>
    {feed?.mode==='image'&&feed.imageUrl&&<img src={feed.imageUrl} alt={label||'选手图片'}/>}{label&&<div className="lb-nameplate">{label}</div>}
  </div>;
}
export function LiveBottom({state,champions,items,version}:{state:BroadcastState;champions:Champion[];items:ItemAssets;version:string}) {
  const blue=bottomPlayers(state,'blue'),red=bottomPlayers(state,'red');
  const ultimateIcons=useUltimateIcons(version,state.players.map(player=>championFor(champions,player.championId)?.id||player.championId));
  const ultimateFor=(player?:Player)=>{const champion=championFor(champions,player?.championId||'');return champion?ultimateIcons[champion.id]:undefined;};
  return <div className="live-bottom" aria-label="局内底部转播包装">
    <div className="lb-patch" aria-label={`游戏版本 ${state.overlay.patchVersion??'26.18'}`}><div><strong>游戏版本</strong><span>GAME PATCH</span></div><b>{state.overlay.patchVersion??'26.18'}</b></div>
    <PlayerFeed state={state} side="blue"/>
    {state.overlay.players&&<section className="lb-scoreboard" aria-label="底部十人计分板">
      <div className="lb-scoreboard-rows">{Array.from({length:5},(_,i)=>{
        const delta=state.overlay.goldDiff?bottomGoldDifference(state.mode,blue[i],red[i]):null;
        return <div className="lb-pair" key={i}>
          <PlayerRow player={blue[i]} champions={champions} items={items} version={version} side="blue" ultimateIcon={ultimateFor(blue[i])}/>
          <div className={`lb-lead ${delta==null?'unavailable':delta>0?'blue':delta<0?'red':'even'}`} title={delta==null?'等待双方有效累计金币 OCR':`双方累计金币差 ${Math.abs(Math.round(delta))} · ${state.mode==='demo'?'演示数据':'OCR'}`}>
            <b>{delta==null?'—':Math.abs(Math.round(delta))}</b>
          </div>
          <PlayerRow player={red[i]} champions={champions} items={items} version={version} side="red" ultimateIcon={ultimateFor(red[i])}/>
        </div>;
      })}</div>
    </section>}
    <PlayerFeed state={state} side="red"/>
  </div>;
}
