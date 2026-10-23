import { useState, useEffect, useRef } from 'react';
import type { BroadcastState, Scene } from '../../shared/types';
import { createDemoState, demoTwitchState } from '../../shared/demo-state';
import { bundledChampions } from '../../shared/champion-art';
import { analysisLabels, analysisModes, type BroadcastAnalysisMode } from '../../shared/broadcast-analysis';
import { archiveGraphicLabels, archiveGraphicModes, type ArchiveGraphicMode } from '../../shared/archive-graphics';
import { BUILTIN_RUNTIME_STYLES } from '../../shared/style-packs';
import { BroadcastCanvas } from './BroadcastCanvas';
import { ArchiveGraphics } from './ArchiveGraphics';
import { SeasonStatisticsOverlay } from './SeasonStatistics';
import { TwitchAudienceGraphic } from './TwitchAudienceWorkspace';
import { sceneInfo } from '../lib';
import { combatReviewLabels, type CombatReviewMode } from '../../shared/combat-review';
import './demo-workspace.css';

export function DemoWorkspace({ state: current }: { state?: BroadcastState }) {
  const [view,setView]=useState('draft'),[missing,setMissing]=useState(false),[variant,setVariant]=useState('bottom'),[pack,setPack]=useState(current?.overlay.stylePack?.id || BUILTIN_RUNTIME_STYLES[0].id),[now,setNow]=useState(Date.now());
  const preview=useRef<HTMLDivElement>(null),[previewWidth,setPreviewWidth]=useState(1200);
  useEffect(()=>{if(!preview.current)return;const observer=new ResizeObserver(entries=>setPreviewWidth(entries[0].contentRect.width));observer.observe(preview.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const state=createDemoState(now),champions=bundledChampions(),style=BUILTIN_RUNTIME_STYLES.find(p=>p.id===pack);
  if(style)state.overlay.stylePack={id:style.id,revision:style.revision,name:style.name};
  let scene:Scene='live';
  if(view.startsWith('analysis:'))state.overlay.analysisMode=view.slice(9) as BroadcastAnalysisMode;
  else if(view.startsWith('combat:'))state.overlay.combatReviewMode=view.slice(7) as CombatReviewMode;
  else if(view in sceneInfo)scene=view as Scene;
  if(scene==='draft'){state.phase='draft';state.draft.locked=false;state.draft.bluePicks[4]='';state.draft.bluePreselect=['','','','','Thresh'];state.overlay.draftLayout=variant==='full-height'?'full-height':'bottom';}
  if(scene==='lineup')state.phase='draft';
  if(scene==='standby')state.phase='pregame';
  if(scene==='postgame')state.overlay.postgamePage=Number(variant)===2?2:Number(variant)===3?3:1;
  if(scene==='ranking'&&variant==='player')state.selectedPlayerId=state.players[0].id;
  if(scene==='live'){state.overlay.killFeed=true;state.overlay.announcer=true;state.overlay.inhibitorTimers=true;state.overlay.fullScoreboard=true;state.overlay.championTabs=variant==='tabs';state.overlay.lFrame=variant==='lframe';}
  if(missing){delete state.combatReview;for(const p of state.players){p.gold=null;p.currentGold=null;p.statsAvailable=false;delete p.skinId;delete p.telemetryDamage;delete p.damageDealt;delete p.fullRuneIds;delete p.statRuneIds;delete p.runeSelection;}state.economy=[];for(const result of state.gameResults!){result.snapshot.players=structuredClone(state.players);result.snapshot.economy=[];}}
  let graphic;
  if(view.startsWith('archive:'))graphic=<ArchiveGraphics state={state} champions={champions} resultId="demo-result-2" mode={view.slice(8) as ArchiveGraphicMode} timeline={{gameId:'demo-2',frames:[{events:[{type:'ITEM_PURCHASED',timestamp:90000,participantId:1,itemId:1055},{type:'ITEM_PURCHASED',timestamp:420000,participantId:1,itemId:3006},{type:'ITEM_SOLD',timestamp:780000,participantId:1,itemId:1055}]}]}} details={{gameId:'demo-2',participants:[{participantId:1,championId:266,teamId:100,summonerName:state.players[0].name}]}}/>;
  else if(view==='season')graphic=<SeasonStatisticsOverlay state={state} metric="damage"/>;
  else if(view==='spotlight')graphic=<SeasonStatisticsOverlay state={state} spotlightPlayerId={JSON.stringify([state.match.blueTeamId,state.players[0].registeredPlayerId])}/>;
  else if(view.startsWith('twitch:'))graphic=<div className="demo-twitch"><TwitchAudienceGraphic state={demoTwitchState(view.slice(7) as 'poll'|'prediction'|'chat-vote',now)}/></div>;
  else graphic=<BroadcastCanvas state={state} champions={champions} scene={scene} output/>;
  return <section className="demo-workspace panel"><header><h2>图形演示与排版预览</h2><p>使用独立模拟比赛检查各阶段、非持续图形和缺失数据状态。当前正式比赛、节目及存档保持原有数据。</p></header><div className="demo-controls"><label>图形<select aria-label="演示图形" value={view} onChange={e=>{setView(e.target.value);setVariant('bottom');}}>{Object.entries(sceneInfo).map(([id,s])=><option key={id} value={id}>{s.name}</option>)}<optgroup label="局内分析">{analysisModes.filter(m=>m!=='off').map(m=><option key={m} value={`analysis:${m}`}>{analysisLabels[m]}</option>)}</optgroup><optgroup label="逐次伤害分析">{Object.entries(combatReviewLabels).filter(([m])=>m!=='off').map(([m,label])=><option key={m} value={`combat:${m}`}>{label}</option>)}</optgroup><optgroup label="归档专用图形">{archiveGraphicModes.map(m=><option key={m} value={`archive:${m}`}>{archiveGraphicLabels[m]}</option>)}</optgroup><option value="season">赛季榜单</option><option value="spotlight">赛季选手聚焦</option><option value="twitch:poll">Twitch 投票</option><option value="twitch:prediction">Twitch 预测</option><option value="twitch:chat-vote">Twitch 聊天投票</option></select></label><label>风格<select aria-label="演示风格" value={pack} onChange={e=>setPack(e.target.value)}>{BUILTIN_RUNTIME_STYLES.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{['draft','postgame','ranking','live'].includes(view)&&<label>布局<select aria-label="演示布局" value={variant} onChange={e=>setVariant(e.target.value)}><option value="bottom">默认</option>{view==='draft'&&<option value="full-height">全高 BP</option>}{view==='postgame'&&<><option value="2">赛后第 2 页</option><option value="3">赛后第 3 页</option></>}{view==='ranking'&&<option value="player">选手焦点</option>}{view==='live'&&<><option value="tabs">英雄栏</option><option value="lframe">L 形布局</option></>}</select></label>}<label className="demo-missing"><input type="checkbox" checked={missing} onChange={e=>setMissing(e.target.checked)}/>缺失数据场景</label></div><div className="demo-preview" ref={preview}><div className="demo-watermark">演示数据 · 本地预览</div><div className="demo-stage" style={{transform:`scale(${previewWidth/1920})`}}>{graphic}</div></div></section>;
}
