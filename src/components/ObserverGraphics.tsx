import { useState } from 'react';
import type { BroadcastState, Champion, Player, Side, StateContext } from '../../shared/types';
import { api, championFor, getTeam, playerCs, playerKda, time } from '../lib';
import { currentIncomeSnapshot, incomeCategories, incomeCategoryLabels } from '../../server/player-income';
import { dataDragonItemImage, type ItemAssets } from './useItemCatalog';
import { summonerSpellImage } from '../../shared/player-assets';

function Hero({id,champions}:{id:string;champions:Champion[]}) {
  const c=championFor(champions,id);
  return <span className="ob-hero">{c?<img src={c.image} alt={c.name}/>:<span>—</span>}</span>;
}
export function PlayerVitals({player}:{player?:Player}) {
  const hp=player?.health,max=player?.maxHealth,mp=player?.resource,mpMax=player?.maxResource;
  return <div className="ob-vitals"><span className={hp==null||!max?'unknown':''} title={hp!=null&&max?`${Math.round(hp)} / ${Math.round(max)} HP`:'生命值未提供'}><i style={{width:`${hp!=null&&max?Math.max(0,Math.min(100,hp/max*100)):0}%`}}/></span><span className={`resource ${mp==null||!mpMax?'unknown':''}`}><i style={{width:`${mp!=null&&mpMax?Math.max(0,Math.min(100,mp/mpMax*100)):0}%`}}/></span></div>;
}
function Spells({player}:{player?:Player}) {
  return <div className="ob-spells">{Array.from({length:2},(_,i)=>{const spell=player?.summonerSpells?.[i],src=summonerSpellImage(spell,'16.19.1');return <span key={i} title={spell?.name||'召唤师技能未提供'}>{src?<img src={src} alt={spell?.name}/>:spell?.name.replace(/^game_spell_displayname_/,'').slice(0,2)||'—'}</span>;})}</div>;
}
function focusPlayer(state:BroadcastState,side?:Side) {
  return state.players.find(p=>p.id===state.selectedPlayerId&&(!side||p.team===side))||state.players.find(p=>(!side||p.team===side)&&p.role==='下路')||state.players.find(p=>!side||p.team===side);
}
function photoFor(state:BroadcastState,player:Player|undefined) {
  if(!player)return undefined;const team=getTeam(state,player.team);
  return player.portrait||team?.players.find(p=>p.name===player.name)?.portrait||team?.players.find(p=>p.role===player.role)?.portrait;
}
export function NativeHudLayer({state}:{state:BroadcastState}) {
  const mode=state.overlay.nativeHud??'auto';
  const fallback=mode==='mask'||(mode==='auto'&&state.nativeHudStatus?.status!=='hidden');
  const scoreMask=mode!=='off'&&(fallback||state.nativeHudStatus?.preserveScore);
  return <>{scoreMask&&state.overlay.scoreboard&&<div className="ob-score-mask" aria-hidden="true"/>}</>;
}
export function SelectedPlayerPanel({state,champions,items,version}:{state:BroadcastState;champions:Champion[];items:ItemAssets;version:string}) {
  const p=focusPlayer(state);return <div className={`ob-selected-panel ${p?.team||'blue'}`}><header><span>PLAYER FOCUS</span><b>{p?getTeam(state,p.team)?.tag:'RIFTCAST'}</b></header><div className="ob-selected-player"><Hero id={p?.championId||''} champions={champions}/><div><strong>{p?.name||'等待选手'}</strong><small>{p?.championName||'英雄待定'} · LV {p?.level||'—'}</small><PlayerVitals player={p}/></div></div><div className="ob-selected-stat"><span>KDA <b>{playerKda(p,true)}</b></span><span>CS <b>{playerCs(p)}</b></span></div><div className="ob-selected-items">{Array.from({length:7},(_,i)=>{const id=(p?.itemSlots||p?.items||[])[i];const src=items[id]?.image||dataDragonItemImage(version,id);return <span key={i}>{src&&<img src={src} alt={items[id]?.name||'装备'}/>}</span>;})}<Spells player={p}/></div></div>;
}
function PlayerPortrait({state,player,champions,className=''}:{state:BroadcastState;player?:Player;champions:Champion[];className?:string}) {
  const photo=photoFor(state,player),hero=championFor(champions,player?.championId||'');
  return <div className={`ob-player-portrait ${player?.team||''} ${className}`}>{photo?<img src={photo} alt={`${player?.name} 选手照片`}/>:hero?<img src={hero.splash} alt={hero.name}/>:<span>选手资料</span>}<div><small>{getTeam(state,player?.team||'blue')?.tag} · {player?.role}</small><strong>{player?.name||'等待选手'}</strong></div></div>;
}
export function IncomeOverlay({state,champions}:{state:BroadcastState;champions:Champion[]}) {
  const snapshot=currentIncomeSnapshot(state);const saved=snapshot?.players.find(p=>p.playerId===state.selectedPlayerId)||snapshot?.players.find(p=>p.role==='下路'&&p.team==='red')||snapshot?.players[0];
  const current=state.players.find(p=>p.id===saved?.playerId);
  const identity=saved?{...current,id:saved.playerId,name:saved.name,role:saved.role,championId:saved.championId,team:saved.team,portrait:saved.portrait||current?.portrait} as Player:focusPlayer(state);
  const max=Math.max(1,...incomeCategories.map(key=>saved?.values[key].value??0));
  return <div className="ob-income"><PlayerPortrait state={state} player={identity} champions={champions} className="ob-income-photo"/><section className="ob-income-values" aria-label="十分钟经济来源"><header><strong>10:00 经济来源</strong><span>{snapshot?(snapshot.mode==='demo'?'演示样例':snapshot.status==='late'?'未采到十分钟数据':`采样 ${time(snapshot.capturedTime)}`):'等待比赛达到 10:00'}</span></header><div className="ob-income-grid">{incomeCategories.map(key=>{const metric=saved?.values[key],value=metric?.value;return <div key={key}><span>{incomeCategoryLabels[key]}</span><b>{value!=null?Math.round(value).toLocaleString('zh-CN'):'—'}</b><i><em style={{width:`${value!=null?value/max*100:0}%`}}/></i>{value==null&&<small>未提供</small>}</div>;})}</div><footer>{saved&&<span>K/D/A {saved.kills==null?'—':`${saved.kills}/${saved.deaths}/${saved.assists}`} · CS {saved.cs??'—'}</span>}<small>{snapshot?.status==='partial'?'部分经济明细未提供':snapshot?.status==='late'?'回放返回 10:00 后可补采':'十分钟快照 · 后续调用保持采样值'}</small></footer></section><div className="ob-income-brand">{state.overlay.sponsorLogo?<img src={state.overlay.sponsorLogo} alt={state.overlay.sponsor||'赛事品牌'}/>:<strong>{state.overlay.sponsor||'RIFTCAST'}</strong>}<small>{state.match.title}</small></div></div>;
}
export function IncomeControls({state,send,notify}:StateContext) {
  const snapshot=currentIncomeSnapshot(state);return <section className="panel ob-income-controls"><div className="panel-head"><h2>十分钟经济来源卡</h2><span className="badge">{snapshot?(snapshot.mode==='demo'?'DEMO':snapshot.status==='ready'?'已就绪':snapshot.status==='partial'?'部分数据':'错过采样'):'自动制作'}</span></div><p className="muted">{snapshot?.detail||'比赛达到 10:00 时自动保存十名选手快照。选择选手后预监，确认后切入节目。'}</p><div className="ob-income-choices">{(snapshot?.players||[]).map(p=><button className={`button small ${state.selectedPlayerId===p.playerId?'primary':''}`} key={p.playerId} onClick={()=>void send({type:'select-player',playerId:p.playerId}).catch(()=>{})}>{p.name} <small>{p.role}</small></button>)}</div><div className="inline-buttons"><button className="button small" onClick={()=>void send({type:'preview-scene',scene:'income'}).catch(()=>{})}>预监经济来源</button><button className="button primary small" onClick={()=>void send({type:'take',scene:'income'}).then(()=>notify('十分钟经济卡已切入节目')).catch(()=>{})}>切入经济来源</button><button className="button small" onClick={()=>void send({type:'preview-scene',scene:'teamfight'}).catch(()=>{})}>预监团战视图 · T</button></div></section>;
}
export function NativeHudControls({state,send,notify}:StateContext) {
  const [busy,setBusy]=useState(false);
  const mode=state.overlay.nativeHud??'auto';
  return <section className="panel ob-hud-controls"><div className="panel-head"><h2>游戏原生 HUD</h2><span className="badge">{state.programScene==='teamfight'?'团战原生视角':state.nativeHudStatus?.status==='hidden'?'回放已隐藏':mode==='off'?'已关闭':'遮挡备用'}</span></div><div className="settings-form"><label className="field">处理方式<select value={mode} onChange={e=>void send({type:'set-overlay',patch:{nativeHud:e.target.value as 'auto'|'mask'|'off'}}).catch(()=>{})}><option value="auto">自动整理回放 HUD，保留底部原生区域</option><option value="mask">仅使用 OBS 遮挡</option><option value="off">关闭处理，使用原生 HUD</option></select></label><p className="muted">{state.nativeHudStatus?.detail||'切入局内节目后应用。保留游戏小地图与场内血条，赛事信息由 RiftCast 输出。'}</p><p className="muted">团战视图直接保留游戏画面，所有处理方式均免除遮挡及自动隐藏。切入后，在游戏观战窗口按 A 切换原生团战视角。</p><p className="muted">遮挡布局按 16:9 默认观战 HUD 校准。游戏 HUD 缩放改变后需核对合成预览；Replay API 不可用时可手动关闭两侧面板、聊天与时间轴。</p><button className="button small" disabled={busy} onClick={async()=>{setBusy(true);try{await api('/api/replay/hud',{method:'POST',body:'{}'});notify('原生 HUD 状态已刷新');}catch(e){notify(e instanceof Error?e.message:'HUD 应用失败');}finally{setBusy(false);}}}>立即应用并核对</button></div></section>;
}
