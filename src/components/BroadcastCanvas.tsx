import { NeutralTimers, TeamfightOverlay } from './CombatOverlay';
import './style-pack-elements.css';
import { useStylePack, stylePackAppearance } from './useStylePack';
import { useEffect, useState, type CSSProperties } from 'react';
import type { BroadcastState, Champion, Scene } from '../../shared/types';
import { currentGameResult, frozenGameState, reportGameResult } from '../../shared/game-results';
import { CustomSceneLayout } from './CustomSceneEditor';
import { GoldRankingOverlay } from './GoldRanking';
import { PlayerBuild } from './PlayerBuild';
import { NativeHudLayer } from './ObserverGraphics';
import { LiveBottom } from './LiveBottom';
import { LiveTop } from './LiveTop';
import { useItemCatalog } from './useItemCatalog';
import { Standby, DraftOverlay, Lineup } from './program/PrematchScenes';
import { EconomyOverlay, Performance, Schedule, Postgame } from './program/DataScenes';
import { Interview } from './program/InterviewScene';
import './broadcast-skins.css';
import './program/program-scenes.css';
import './observer-graphics.css';
import './style-pack-surfaces.css';
export { ChampionImage } from './program/ProgramPrimitives';
export { EconomyChart, economySource } from './EconomyChart';

function CapturePreview({ scene }: { scene: Scene }) {
  return <div className={`cast-capture-preview capture-${scene}`}><span>{scene === 'draft' ? '选手 / 舞台画面' : scene === 'interview' ? '采访视频画面' : scene === 'teamfight' ? '游戏原生团战视角' : '游戏观战画面'}</span><small>HUD 排版示意 · 实际合成在 OBS 预监核对</small></div>;
}
export function BroadcastCanvas({state:sourceState,champions,scene,output=false,bus='preview'}:{state:BroadcastState;champions:Champion[];scene:Scene;output?:boolean;bus?:'program'|'preview'}) {
 const frozenResult=bus!=='program'&&['ranking','postgame'].includes(scene)?currentGameResult(sourceState)||reportGameResult(sourceState):undefined;
 const state=frozenResult?frozenGameState(sourceState,frozenResult):sourceState;
 const look=useStylePack(state.overlay.stylePack),appearance=stylePackAppearance(look.pack,scene,state.overlay.accent);
 const [now,setNow]=useState(Date.now());const {version,items}=useItemCatalog(champions,state.production?.versions.resources);
 useEffect(()=>{if(scene!=='standby'&&scene!=='live')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[scene]);
 if(scene.startsWith('custom:')){const custom=state.customScenes?.find(s=>s.id===scene);return <div className={`broadcast-container cast-container ${output?'is-output':''}`}><div className="broadcast-canvas cast-canvas">{custom&&<CustomSceneLayout scene={custom} state={state} placeholders={!output}/>}</div></div>;}
 const liveScene=['live','teamfight','gold-ranking','economy','ranking'].includes(scene);
 const overlayScene=['draft','live','teamfight','gold-ranking','economy','ranking','interview'].includes(scene),selected=state.players.some(p=>p.id===state.selectedPlayerId);
 const feed=scene==='draft'||scene==='lineup'?state.connections.lcu:state.connections.live;
 const sourceIssue=!frozenResult&&state.mode==='live'&&['live','teamfight','gold-ranking','draft','lineup','economy','ranking'].includes(scene)&&feed.status!=='connected';
 return <div className={`broadcast-container cast-container skin-arena ${output?'is-output':''}`} data-style-pack={look.pack.id} data-style-revision={look.pack.revision} data-style-status={look.error?'error':look.loading?'loading':'ready'} data-pack-background={appearance.background} data-pack-textures={appearance.textures} data-pack-elements={appearance.elements} data-pack-body={look.pack.fonts.body} data-pack-display={look.pack.fonts.display} style={appearance.style}><div className={`broadcast-canvas cast-canvas cast-scene-${scene} ${state.overlay.ticker?'has-ticker':''} ${overlayScene&&output?'transparent cast-transparent':''}`} style={{'--hud-scale':state.overlay.scale} as CSSProperties}>
 {overlayScene&&!output&&<CapturePreview scene={scene}/>}
 {liveScene&&<NativeHudLayer state={state}/>}
 {liveScene&&<NeutralTimers state={state}/>}
 {scene==='teamfight'&&<TeamfightOverlay state={state} champions={champions} version={version}/> }
 {scene==='live'&&<LiveBottom state={state} champions={champions} items={items} version={version}/>}
 {scene==='standby'&&<Standby state={state} now={now}/>}
 {scene==='draft'&&<DraftOverlay state={state} champions={champions}/>}
 {scene==='lineup'&&<Lineup state={state} champions={champions}/>}
 {liveScene&&state.overlay.scoreboard&&<LiveTop state={state}/>}
 {scene==='gold-ranking'&&<GoldRankingOverlay state={state} champions={champions}/>}
 {scene==='economy'&&<EconomyOverlay state={state}/>}
 {scene==='ranking'&&(selected?<PlayerBuild state={state} champions={champions} bus={bus} output/>:<Performance state={state} champions={champions} items={items} version={version}/>)}
 {scene==='schedule'&&<Schedule state={state}/>}
 {scene==='postgame'&&<Postgame state={state} champions={champions} items={items} version={version}/>}
 {scene==='interview'&&<Interview state={state}/>}
 {appearance.frame&&<img className="style-pack-frame" src={appearance.frame} alt="" aria-hidden="true"/>}
 {!output&&(look.error||look.loading)&&<span className="style-pack-preview-status" role="status">{look.error?`${look.error}；保留 ${look.pack.name}`:'风格包贴图加载中'}</span>}
 {(state.overlay.sponsor||state.overlay.sponsorLogo)&&<div className="cast-sponsor">{state.overlay.sponsorLogo?<img src={state.overlay.sponsorLogo} alt={state.overlay.sponsor||'赞助商标志'}/>:<span>{state.overlay.sponsor}</span>}</div>}
 {state.overlay.ticker&&<div className="cast-ticker"><b>{state.match.title}</b><span>{state.overlay.tickerText}</span></div>}
 {sourceIssue&&<div className="cast-source-status">{feed.updatedAt?'比赛数据暂不可用':'等待比赛数据'}{feed.updatedAt&&<span> · 截至 {new Date(feed.updatedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}</span>}</div>}
 </div></div>;
}
