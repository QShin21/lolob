import {FitName} from './FitName';
import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, Player, Side } from '../../shared/types';
import { runeImage, summonerSpellImage } from '../../shared/player-assets';
import { resolvedPlayerFeed, playerFeedControl } from '../../shared/player-feeds';
import { bottomGoldDifference, bottomEquipment, bottomItemSlots, bottomPlayers } from '../../server/bottom-scoreboard';
import { championFor, playerCs, playerKda, playerVision, playerGoldText } from '../lib';
import { dataDragonItemImage, type ItemAssets } from './useItemCatalog';
import { useUltimateIcons } from './useUltimateIcons';
import { useGameClock } from './GameTime';
import { activeBuffs, cooldownView, telemetryFresh, type Cooldown } from '../../shared/player-telemetry';
import './live-bottom.css';

export function Icon({src,label,missing='',className='',cooldown,time=0,fresh=true}:{src?:string;label:string;missing?:string;className?:string;cooldown?:Cooldown;time?:number;fresh?:boolean}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  const cd=cooldownView(cooldown,time,fresh),status=cd.state==='cooldown'?`冷却 ${Math.ceil(cd.remaining)} 秒`:cd.state==='ready'?'就绪':cd.state==='unlearned'?'尚未学习':'冷却状态未知';
  return <span className={`lb-icon ${className} ${!src||failed?'is-unavailable':''} ${cooldown?'cd-'+cd.state:''}`} title={failed?`${label} · 图标加载失败`:cooldown?`${label} · ${status}`:label} data-cooldown-state={cd.state}>
    {src&&!failed?<img src={src} alt={label} onError={()=>setFailed(true)}/>:missing&&<span className="lb-icon-fallback">{missing}</span>}
    {cd.state==='cooldown'&&<span className="lb-cooldown-mask" style={{background:`conic-gradient(transparent 0deg ${360-cd.fraction*360}deg, rgba(0,0,0,.76) ${360-cd.fraction*360}deg 360deg)`}}/>}
    {cd.seconds!==null&&<b className="lb-cooldown-seconds">{cd.seconds}</b>}
  </span>;
}
function Spells({player,version,time,fresh}:{player?:Player;version:string;time:number;fresh:boolean}) {
  return <div className="lb-spells" aria-label="召唤师技能">{Array.from({length:2},(_,i)=>{
    const spell=player?.summonerSpells?.[i];
    return <Icon key={i} src={summonerSpellImage(spell,version)} label={spell?.name||'召唤师技能未提供'} missing="?" cooldown={spell?.cooldown} time={time} fresh={fresh}/>;
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
export function Meter({current,max,kind,label}:{current?:number;max?:number;kind:string;label:string}) {
  const available=current!=null&&Number.isFinite(current)&&max!=null&&Number.isFinite(max)&&max>0;
  const percentage=available?Math.max(0,Math.min(100,current!/max!*100)):0;
  return <span className={`lb-meter ${kind} ${available?'':'is-unavailable'}`} title={available?`${label} ${Math.round(current!)} / ${Math.round(max!)}`:`${label}未提供`} aria-label={available?`${label} ${Math.round(percentage)}%`:`${label}未提供`}>
    <i style={{width:`${percentage}%`}}/>
  </span>;
}
function scoreboardName(name:string) {
  let result='',length=0;
  for(const character of name){const width=/\p{Script=Han}/u.test(character)?2:1;if(length+width>16)break;result+=character;length+=width;}
  return result;
}
function Identity({player,ultimateIcon,time,fresh}:{player?:Player;ultimateIcon?:string;time:number;fresh:boolean}) {
  const ultimate=player?.ultimate,state=ultimate?.state||'unknown';
  const status=state==='ready'?'终极技能就绪':state==='unlearned'?'终极技能尚未学习':state==='cooldown'?`终极技能冷却${ultimate?.cooldownRemaining!=null?` ${Math.ceil(ultimate.cooldownRemaining)} 秒`:''}`:'终极技能状态未提供';
  return <div className="lb-identity">
    <div className="lb-identity-line">
      <FitName className="lb-player-name">{scoreboardName(player?.name||'—')}</FitName>
    </div>
    <div className="lb-status-line">
      <span className={`lb-ultimate ${fresh?state:'unknown'}`} title={status} aria-label="终极技能">
        <Icon src={ultimate?.icon||ultimateIcon} label="终极技能" missing="R" cooldown={ultimate??{state:'unknown'}} time={time} fresh={fresh}/>
      </span>
      <div className="lb-vitals">
      <Meter current={fresh?player?.experience:undefined} max={player?.maxExperience} kind="experience" label="当前等级经验"/>
      <Meter current={fresh?player?.health:undefined} max={player?.maxHealth} kind="health" label="生命值"/>
      <Meter current={fresh?player?.resource:undefined} max={player?.maxResource} kind={`resource ${(player?.resourceType||'mana').toLowerCase()}`} label="资源值"/>
      </div>
    </div>
  </div>;
}
function Inventory({player,items,version,time,fresh}:{player?:Player;items:ItemAssets;version:string;time:number;fresh:boolean}) {
  const slots=bottomItemSlots(player),quest=player?.roleQuest;
  const itemIcon=(id:number,slot:number)=><span className="lb-item-slot" key={slot}>
    <Icon src={items[id]?.image||dataDragonItemImage(version,id)} label={id?(items[id]?.name||`装备 ${id}`):'空装备栏'} cooldown={player?.itemCooldowns?.find(c=>c.slot===slot&&c.itemId===id)?.cooldown} time={time} fresh={fresh}/>
    {player?.itemCounts?.[slot]!=null&&player.itemCounts[slot]>1&&<b className="lb-item-count">{player.itemCounts[slot]}</b>}
  </span>;
  const questKnown=quest?.completed!=null;
  const questLabel=questKnown?`分路任务${quest?.completed?'已完成':'进行中'}${quest?.progress!=null?` ${quest.progress}${quest.maxProgress!=null?` / ${quest.maxProgress}`:''}`:''}`:'分路任务状态未提供';
  return <div className="lb-inventory" aria-label="装备、分路任务与饰品">
    <div className="lb-items">{bottomEquipment(player,items).map(({id,slot})=>itemIcon(id,slot))}</div>
    {questKnown&&<div className={`lb-quest ${questKnown?quest?.completed?'is-complete':'is-pending':'is-unavailable'}`} aria-label={questLabel} title={questLabel}>
      {quest?.icon?<Icon src={quest.icon} label={questLabel}/>:<span className="lb-quest-mark">{questKnown?quest?.completed?'✓':'◇':'?'}</span>}
    </div>}
    <div className="lb-trinket" title={playerVision(player)!=='—'?`视野得分 ${playerVision(player)}`:'视野得分未提供'}>
      <span className="lb-vision-score">{playerVision(player)}</span>
      <Icon src={items[slots[6]]?.image||dataDragonItemImage(version,slots[6])} label={slots[6]?(items[slots[6]]?.name||'饰品'):'空饰品栏'} cooldown={player?.itemCooldowns?.find(c=>c.slot===6&&c.itemId===slots[6])?.cooldown} time={time} fresh={fresh}/>
    </div>
  </div>;
}
function PlayerRow({player,champions,items,version,side,ultimateIcon,time,now,available}:{player?:Player;champions:Champion[];items:ItemAssets;version:string;side:Side;ultimateIcon?:string;time:number;now:number;available:boolean}) {
  const champion=championFor(champions,player?.championId||'');
  const fresh=available&&telemetryFresh(player?.telemetry,time,now);
  const buffs=activeBuffs(player?.buffs,time,fresh,!!player?.isDead);
  const respawn=fresh&&player?.isDead?player.respawnAt!==undefined?Math.max(0,player.respawnAt-time):player.respawnTimer:undefined;
  const gold=playerGoldText(player,now),goldParts=gold.match(/^(\d+)\((\d+)\)$/);
  return <div className={`lb-player-row ${side} ${player?.isDead?'is-dead':''}`} aria-label={`${player?.name||'等待选手'} 英雄、状态、装备、视野、剩余金币、总经济、KDA 与补刀`}>
    <Inventory player={player} items={items} version={version} time={time} fresh={fresh}/><Runes player={player}/><Spells player={player} version={version} time={time} fresh={fresh}/>
    <div className={`lb-champion ${buffs.baron?'has-baron':''} ${buffs.elder?'has-elder':''}`} title={`${player?.name||'等待选手'} · ${champion?.name||'英雄待定'}${buffs.baron?' · 男爵增益':''}${buffs.elder?' · 远古龙增益':''}`}>
      {champion&&<img src={champion.image} alt={champion.name}/>}
      <b className="lb-level">{player?.level&&player.level>0?player.level:'—'}</b>
      {player?.isDead&&<span className="lb-respawn">{respawn!=null&&respawn>0?Math.ceil(respawn):'—'}</span>}
    </div>
    <Identity player={player} ultimateIcon={ultimateIcon} time={time} fresh={fresh}/>
    <span className="lb-player-gold" aria-label={`剩余金币（总经济） ${gold}`} title={`剩余金币（总经济） ${gold}`}>{goldParts?<><b>{goldParts[1]}</b><small>({goldParts[2]})</small></>:gold}</span>
    <div className="lb-stat-column"><FitName className="lb-cs">{String(playerCs(player))}</FitName><FitName className="lb-kda">{playerKda(player,true)}</FitName></div>
  </div>;
}
export function PlayerFeed({state,side}:{state:BroadcastState;side:Side}) {
  const feed=resolvedPlayerFeed(state,side);
  if(feed?.mode==='off')return null;
  const label=feed.label;
  return <div className={`lb-feed ${side} ${feed?.mode==='camera'?'is-camera':feed?.imageUrl?'is-image':'is-empty'}`} data-feed-index={playerFeedControl(state.overlay).activeIndex} aria-label={`${side==='blue'?'蓝':'红'}方选手画面`}>
    {feed?.mode==='image'&&feed.imageUrl&&<img src={feed.imageUrl} style={{objectPosition:`${feed.focusX??50}% ${feed.focusY??35}%`}} alt={label||'选手图片'} onError={e=>{e.currentTarget.style.visibility='hidden';e.currentTarget.parentElement?.classList.add('is-empty');}}/>}{label&&<div className="lb-nameplate">{label}</div>}
  </div>;
}
export function LiveBottom({state,champions,items,version}:{state:BroadcastState;champions:Champion[];items:ItemAssets;version:string}) {
  const time=useGameClock(state,true);
  const available=state.connections.live.status==='connected'&&!state.gameClock?.awaitingLiveSample;
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),250);return()=>window.clearInterval(timer);},[]);
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
          <PlayerRow player={blue[i]} champions={champions} items={items} version={version} side="blue" ultimateIcon={ultimateFor(blue[i])} time={time} now={now} available={available}/>
          <div className={`lb-lead ${delta==null?'unavailable':delta>0?'blue':delta<0?'red':'even'}`} title={delta==null?'等待双方有效累计金币':`双方累计金币差 ${Math.abs(Math.round(delta))} · ${blue[i]?.goldSource==='memory'&&red[i]?.goldSource==='memory'?'只读遥测':'累计经济'}`}>
            <b>{delta==null?'—':Math.abs(Math.round(delta))}</b>
          </div>
          <PlayerRow player={red[i]} champions={champions} items={items} version={version} side="red" ultimateIcon={ultimateFor(red[i])} time={time} now={now} available={available}/>
        </div>;
      })}</div>
    </section>}
    <PlayerFeed state={state} side="red"/>
  </div>;
}
