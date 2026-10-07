import { Notification, TakeControl } from './components/ConsoleUI';
import { MonitorPane } from './components/MonitorPane';
import { SceneLibrary } from './components/SceneLibrary';
import { Remote } from './pages/Remote';
import { Help } from './pages/Help';
import { GoldRankingControls } from './components/GoldRanking';
import { PlayerFeedSwitcher } from './components/PlayerFeedSwitcher';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, AudioLines, Check, ChevronDown, ChevronRight, CircleHelp, Clapperboard, Clock3, Copy, Database, ExternalLink, Focus, Gamepad2, LayoutDashboard, Maximize2, Monitor, Pause, Play, Radio, RotateCcw, Settings2, ShieldCheck, Swords, Trophy, Users, Wifi, Zap } from 'lucide-react';
import type { BroadcastState, Champion, Phase, Player, Scene, Side, StateContext } from '../shared/types';
import { api, championFor, getTeam, gold, outputUrl, playerKda, sceneInfo, time } from './lib';
import { useBroadcast } from './useBroadcast';
import { Brand } from './components/Icons';
import { BroadcastCanvas, ChampionImage, EconomyChart } from './components/BroadcastCanvas';
import { ObsLivePreview, type ObsPreviewStatus } from './components/ObsLivePreview';
import { PlayerBuild } from './components/PlayerBuild';
import { BroadcastLook } from './components/BroadcastLook';
import { FearlessControls, usedDraftChampions } from './components/FearlessControls';
import { GameTime, GameClockConnectionProvider } from './components/GameTime';

import { WorkflowRail, StudioOutputDock, WrapUp, type WorkflowPage } from './components/DirectorWorkflow';
import { SceneCard } from './components/SceneCard';
import { MatchLifecycle } from './components/MatchLifecycle';
import { ProductionBar, ProductionDesk } from './components/ProductionDesk';
import { programState } from '../shared/production';
import { DraftProductionControls } from './components/DraftProductionControls';
import { version } from '../package.json';
const Draft=lazy(()=>import('./pages/Draft').then(m=>({default:m.Draft})));
const LiveData=lazy(()=>import('./pages/LiveData').then(m=>({default:m.LiveData})));
const Management=lazy(()=>import('./pages/Management').then(m=>({default:m.Management})));
const Settings=lazy(()=>import('./pages/Settings').then(m=>({default:m.Settings})));
type Page=WorkflowPage;
const scenes=Object.keys(sceneInfo) as Scene[];
const phaseLabels:Record<Phase,string>={pregame:'赛前准备',draft:'BP 阶段',live:'局内直播',postgame:'赛后复盘'};
const navItems=[{id:'studio' as Page,name:'导播工作台',icon:LayoutDashboard},{id:'draft' as Page,name:'BP 与阵容',icon:Swords},{id:'data' as Page,name:'实时数据',icon:Activity},{id:'manage' as Page,name:'赛事与素材',icon:Trophy}];
const connectionNames={lcu:'英雄联盟客户端',live:'局内实时数据',replay:'录像与回放',obs:'OBS 直播引擎'};

export default function App() {
  const broadcast=useBroadcast();const {state,champions,connected,error,toast,notify,send,seat,dismissNotice}=broadcast;
  const readPage=()=>{const value=location.hash.replace('#','') as Page;return ['studio','draft','data','manage','settings','help','wrap'].includes(value)?value:'studio';};
  const [page,setCurrentPage]=useState<Page>(readPage),[visited,setVisited]=useState<Set<Page>>(()=>new Set([readPage()]));
  const setPage=(next:Page)=>{setCurrentPage(next);setVisited(v=>new Set([...v,next]));history.replaceState(null,'',`${location.pathname}${location.search}#${next}`);};
  useEffect(()=>{const update=()=>setPage(readPage());window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
  const [streamReady,setStreamReady]=useState(false);
  const [managementTab,setManagementTab]=useState<'schedule'|'recordings'>('schedule');
  const navigate=(next:Page)=>{if(next==='manage')setManagementTab('schedule');setPage(next);};
  useEffect(()=>{if(state?.connections.obs.status!=='connected')setStreamReady(false);},[state?.connections.obs.status]);
  useEffect(()=>{window.scrollTo(0,0);},[page]);
  const output=location.pathname.startsWith('/overlay');const remote=location.pathname.startsWith('/remote');
  useEffect(()=>{
    if(output||remote||!state?.production)return;
    const handler=(e:KeyboardEvent)=>{if(e.repeat||e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable]'))return;const key=[e.ctrlKey?'Control':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',e.key==='Enter'?'Enter':e.key.toUpperCase()].filter(Boolean).join('+');const binding=Object.entries(state.production!.hotkeys).find(([,value])=>value===key)?.[0];if(!binding)return;e.preventDefault();if(binding==='take'){void send({type:'take'}).catch(()=>{});return;}if(binding==='emergency'||binding==='live'){void api('/api/obs/production',{method:'POST',body:JSON.stringify({action:binding==='emergency'?'emergency':'return-live'})}).catch(e=>notify(e.message,'error'));return;}const action=binding==='analysis'?'analysis-off':binding==='feeds'?'feeds-off':'undo';void send({type:'production',command:{op:'immediate',action}}).catch(()=>{});};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[state?.production?.hotkeys,output,remote,send,notify]);
  useEffect(()=>{document.body.classList.toggle('overlay-body',output);document.documentElement.classList.toggle('overlay-document',output);return()=>{document.body.classList.remove('overlay-body');document.documentElement.classList.remove('overlay-document');};},[output]);
  useEffect(()=>{
    if(output||remote)return;
    const handler=(e:KeyboardEvent)=>{
      const target=e.target instanceof Element?e.target:null;
      if(target?.closest('input,textarea,select,[contenteditable]')||e.ctrlKey||e.metaKey||e.altKey)return;
      if(page!=='studio')return;
      if(e.repeat){if(e.key==='Enter'&&target?.closest('.scene-card,.take-button'))e.preventDefault();return;}
      const scene=scenes.find(s=>sceneInfo[s].shortcut.toLowerCase()===e.key.toLowerCase());
      if(scene){e.preventDefault();void send({type:'preview-scene',scene}).catch(()=>{});}
      // A selected scene card retains focus. Enter must take the current preview
      // even after another shortcut changes it, without activating the old card.
      if(e.key==='Enter'&&(!target?.closest('button,a,summary,[role=button]')||target.closest('.scene-card'))){e.preventDefault();void send({type:'take'}).catch(()=>{});}
      if(e.key===' '&&state?.mode==='demo'&&!(e.target as HTMLElement)?.closest('button,a,summary,[role=button]')){e.preventDefault();void send({type:'demo-pause',paused:!state.paused}).catch(()=>{});}
    };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[output,remote,page,state?.paused,state?.mode,send,notify]);
  if(!state)return <div className={`loading-screen ${output?'output-loading':''}`}><Brand/><span className="loading-dot"/><h2>{error?'本地服务尚未连接':'正在连接导播工作站'}</h2><p>{error||'载入赛事、素材与节目状态'}</p>{error&&<button className="button primary" onClick={()=>location.reload()}>重新连接</button>}</div>;
  const ctx={state,champions,send,notify,seat,connected}, onAir=programState(state);
  if(output)return <GameClockConnectionProvider value={connected}><BroadcastCanvas bus={new URLSearchParams(location.search).get('preview')==='1'?'preview':'program'} state={new URLSearchParams(location.search).get('preview')==='1'?state:programState(state)} champions={champions} scene={new URLSearchParams(location.search).get('preview')==='1'?state.previewScene:state.programScene} output/>{!connected&&<div className="output-offline">导播服务中断 · 保留最后画面</div>}</GameClockConnectionProvider>;
  if(remote)return <GameClockConnectionProvider value={connected}><Remote {...ctx} connected={connected} toast={toast} dismissNotice={dismissNotice}/></GameClockConnectionProvider>;
  const titles={studio:['导播工作台','从预监到播出，每一次切换都尽在掌握。'],draft:['BP 与阵容','编排双方英雄选择，呈现每一个决策时刻。'],data:['实时数据','读懂比赛走势，捕捉选手与团队的关键表现。'],manage:['赛事与素材','准备赛程、阵容与视觉素材，让赛事随时就绪。'],settings:['连接与输出','连接比赛信号，设置画面、声音与直播输出。'],help:['使用指南','从赛事准备开始，完成一场精彩转播。'],wrap:['赛后收尾','停止本场输出，保存对局数据，准备下一场转播。']};
  return <GameClockConnectionProvider value={connected}><div className={'app-shell page-'+page+(state.production?.layout==='dual'?' studio-layout-dual':'')}><aside className="sidebar"><div className="sidebar-brand"><Brand/><span className="brand-edition">ARENA</span></div><div className="workspace-label">导播空间</div><nav aria-label="主导航">{navItems.map(item=><button key={item.id} title={item.name} aria-current={page===item.id?'page':undefined} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}><item.icon size={19}/><span>{item.name}</span>{page===item.id&&<span className="nav-active-dot"/>}</button>)}</nav><div className="sidebar-divider"/><div className="workspace-label">工作站设置</div><button title="连接与输出" aria-current={page==='settings'?'page':undefined} className={`nav-item ${page==='settings'?'active':''}`} onClick={()=>setPage('settings')}><Settings2 size={19}/><span>连接与输出</span></button><button title="使用指南" aria-current={page==='help'?'page':undefined} className={`nav-item ${page==='help'?'active':''}`} onClick={()=>setPage('help')}><CircleHelp size={19}/><span>使用指南</span></button><div className="sidebar-session"><span className="session-label">当前播出</span><strong>{onAir.match.title}</strong><div><span className="blue-text">{getTeam(onAir,'blue')?.tag||'蓝色方'}</span><span>{onAir.match.blueScore} : {onAir.match.redScore}</span><span className="red-text">{getTeam(onAir,'red')?.tag||'红色方'}</span></div></div><div className="sidebar-bottom"><div className="local-status"><span className={`status-dot ${connected?'green':'red'}`}/><strong>本地工作站</strong><span>{connected?'已就绪':'连接中'}</span></div><small>RiftCast v{version} <span>Windows</span></small><div className="legal-note">独立社区工具 · Riot Games 未背书</div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs"><span className="workspace-mark">RC</span><span>导播空间</span><ChevronRight size={13}/><strong>{titles[page][0]}</strong></div><div className="topbar-right"><span className={`mode-pill ${state.mode==='demo'?'demo':'live'}`}><span className="status-dot"/>{state.mode==='demo'?'演示模式':'本地实况'}</span><span className="topbar-divider"/><Clock3 size={14}/><span>{new Date().toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'})}</span><div className="avatar">OB</div></div></header>
    <main><div className="page-heading"><div><div className="eyebrow"><span className="heading-dash"/> RIFTCAST ARENA <span>/ 赛事导播</span></div><h1>{titles[page][0]}</h1><p>{titles[page][1]}</p></div><div className="heading-actions"><button className="button" onClick={()=>navigate('manage')}><Trophy size={15}/>赛事准备</button><button className="button primary" onClick={()=>navigate('settings')}><Settings2 size={15}/>连接与输出</button></div></div>
    {!connected&&<div className="connection-alert"><Wifi size={16}/>{error||'数据同步已中断，正在重连。画面保留最后一次数据。'}</div>}
    <WorkflowRail state={state} page={page} onNavigate={navigate}/><ProductionBar {...ctx}/>
    {page==='studio'&&<details className="studio-match-lifecycle"><summary>本局结算与下一局</summary><MatchLifecycle {...ctx} onNextGame={()=>navigate('draft')} onReport={()=>navigate('studio')} onRecords={()=>{setManagementTab('recordings');setPage('manage');}}/></details>}
    <Suspense fallback={<div className="page-loading" role="status">正在载入页面…</div>}>
    {visited.has('studio')&&<div className="preserved-page" hidden={page!=='studio'}><Studio {...ctx} streamReady={streamReady} onSettings={()=>navigate('settings')} onManage={()=>navigate('manage')}/></div>}
    {visited.has('draft')&&<div className="preserved-page" hidden={page!=='draft'}><Draft {...ctx}/></div>}
    {page==='data'&&<LiveData {...ctx}/>}
    {visited.has('manage')&&<div className="preserved-page" hidden={page!=='manage'}><Management {...ctx} initialTab={managementTab} onOpenSettings={()=>navigate('settings')}/></div>}
    {visited.has('settings')&&<div className="preserved-page" hidden={page!=='settings'}><Settings {...ctx} outputReady={streamReady} onOpenStudio={()=>navigate('studio')} onOutputReady={setStreamReady}/></div>}
    {page==='help'&&<Help state={state} onNavigate={navigate}/>}
    {page==='wrap'&&<WrapUp {...ctx} streamReady={streamReady} onSettings={()=>navigate('settings')} onManage={()=>navigate('manage')} onRecords={()=>{setManagementTab('recordings');setPage('manage');}} onNextGame={()=>navigate('draft')} onReport={()=>navigate('studio')}/>}
    </Suspense><footer className="workspace-footer"><span><ShieldCheck size={12}/> 本地数据 · 实时同步</span><span>{state.mode==='demo'?'当前数据为虚构演示数据':'本机客户端数据 · 缺失字段以 — 显示'}<span className="footer-dot">·</span>1920 × 1080 输出</span></footer>
    </main></div><Notification notice={toast} dismiss={dismissNotice}/></div></GameClockConnectionProvider>;
}

function Studio({state,champions,send,notify,seat,connected,onSettings,onManage,streamReady}:StateContext&{onSettings:()=>void;onManage:()=>void;streamReady:boolean}) {
  const blue=getTeam(state,'blue');const red=getTeam(state,'red');
  const [eventFilter,setEventFilter]=useState('all');
  const [detailsOpen,setDetailsOpen]=useState(false);
  const latestState=useRef(state);latestState.current=state;
  const [sampledState,setSampledState]=useState(state);
  useEffect(()=>{const timer=window.setInterval(()=>{if(!document.hidden)setSampledState(latestState.current);},1000);return()=>window.clearInterval(timer);},[]);
  const quickScenes:Scene[]=['live','teamfight','draft','gold-ranking'];
  const selectScene=(scene:Scene)=>{void send({type:'preview-scene',scene}).catch(()=>{});};
  const card=(scene:Scene)=><SceneCard key={scene} {...{state,sampledState,champions,scene}} onSelect={selectScene}/>;
  const statsLabel=(p:Player)=>state.mode==='demo'?'演示':p.statsAvailable===false?'未提供':p.statsSource==='ocr'?'OCR':p.statsSource==='api'?'API':'待采集';
  const statsDetail=(p:Player)=>state.mode==='demo'?'虚构演示数据':p.statsAvailable===false?'当前对局未提供有效 KDA 与补刀，等待计分板采样':p.statsSource==='ocr'?`观战计分板 OCR · 采样 ${p.statsSampledAt||'时间未提供'} · ${p.statsSampledAt&&p.statsExpiresAt&&Number.isFinite(Date.parse(p.statsExpiresAt)-Date.parse(p.statsSampledAt))?`${Math.max(0,(Date.parse(p.statsExpiresAt)-Date.parse(p.statsSampledAt))/1000)} 秒有效`:'有效期未提供'}`:p.statsSource==='api'?`局内 API 的 KDA 与补刀${p.statsSampledAt?` · 采样 ${p.statsSampledAt}`:''}`:'等待对局统计采集';
  const statsAvailable=(p:Player)=>state.mode==='demo'||p.statsAvailable!==false;
  const teamKills=(side:Side)=>state.mode==='live'&&(!state.players.some(p=>p.team===side)||state.players.some(p=>p.team===side&&p.statsAvailable===false))?'—':state.stats[side].kills;
  return <><div className="match-bar"><div className="match-identity"><div className="match-icon"><Trophy size={20}/></div><div><strong>{state.match.title}</strong><span>{state.match.subtitle} <b>·</b> {state.match.format} <b>·</b> 第 {state.match.game} 局</span></div></div><div className="match-versus"><span className="blue-text">{blue?.tag}</span><b>{state.match.blueScore}<i>:</i>{state.match.redScore}</b><span className="red-text">{red?.tag}</span></div><button className="button small match-change" onClick={onManage}>更换比赛</button><div className="match-time"><span className="status-dot green"/><GameTime state={state}/><small>比赛时间</small></div></div>
  <div className="phase-bar"><div className="phases">{(Object.keys(phaseLabels) as Phase[]).map((phase,i)=><button key={phase} className={state.phase===phase?'selected':''} onClick={()=>void send({type:'set-phase',phase}).catch(()=>{})}><span>{String(i+1).padStart(2,'0')}</span>{phaseLabels[phase]}{i<3&&<ChevronRight size={13}/>}</button>)}</div><div className="demo-controls">{state.mode==='demo'?<><span>演示数据</span><button title={state.paused?'播放演示':'暂停演示'} onClick={()=>void send({type:'demo-pause',paused:!state.paused}).catch(()=>{})}>{state.paused?<Play size={14}/>:<Pause size={14}/>}</button><button title="重置演示" onClick={()=>void send({type:'demo-reset'}).catch(()=>{})}><RotateCcw size={13}/></button></>:<span><Activity size={13}/> 客户端同步</span>}</div></div>
  <section className="studio-stage" aria-label="节目、预监与快捷切入">
    <div className="program-stack"><MonitorPane kind="program" purpose="program" {...{state,champions}}/><StudioOutputDock {...{notify,onSettings,streamReady}}/></div>
    <div className="studio-preview-column"><MonitorPane kind="preview" purpose={state.production?.dynamicPreview?'dynamic':'monitor'} {...{state,champions}}/>
      <div className="take-bar"><div className="take-route"><span className="route-preview"><i/>待切入 <strong>{sceneInfo[state.previewScene].name}</strong></span></div><TakeControl {...{state,send,seat,connected}}/></div>
      <section className="quick-scenes scenes-panel"><div className="quick-scenes-heading"><Clapperboard size={13}/><span>常用切入</span><small>点击选择预监</small></div><div className="scene-grid">{quickScenes.map(card)}</div></section>
    </div>
    <aside className="studio-task-dock"><ProductionDesk {...{state,champions,send,notify,seat,connected}}/></aside>
  </section>
  <SceneLibrary {...{state,sampledState,champions}} onSelect={selectScene}/>
  <div className="studio-operation-note"><span><kbd>1–9</kbd> / <kbd>T</kbd> / <kbd>G</kbd> 选择预监 <ArrowRight size={12}/> <kbd>Enter</kbd> 切入节目</span><span>预监每秒更新 · 场景卡显示 HUD 包装</span></div>

  <details className="studio-details" open={detailsOpen} onToggle={event=>setDetailsOpen(event.currentTarget.open)}><summary>画面包装与对局详情<ChevronDown size={15}/></summary>{detailsOpen&&<><BroadcastLook {...{state,champions,send,notify}}/><div className="studio-grid"><div className="studio-main">
    <GoldRankingControls {...{state,champions,send,notify}}/><section className="panel lineup-panel"><div className="panel-head"><h2><Users size={16}/>双方阵容</h2><span className="muted">{state.players.length} 名选手 <span className="tiny-divider">/</span> {state.mode==='demo'?'演示数据':'当前对局 · API / OCR'}</span></div><div className="roster-columns">{(['blue','red'] as const).map(side=><div key={side} className={`roster-team ${side}`}><div className="roster-team-head"><span className="team-letter" style={{background:getTeam(state,side)?.color}}>{getTeam(state,side)?.tag.slice(0,1)}</span><strong title="赛事设置中的战队简称">{getTeam(state,side)?.tag}</strong><span title="赛事设置中的战队资料">{getTeam(state,side)?.name} · 赛事资料</span><b>{teamKills(side)} <small>击杀</small></b></div><div className="roster-table-head"><span>选手 / 英雄</span><span>K / D / A</span><span>补刀</span><span>累计经济</span></div>{state.players.filter(p=>p.team===side).map(p=><button className={`roster-row ${state.selectedPlayerId===p.id?'selected':''}`} key={p.id} onClick={()=>void send({type:'select-player',playerId:state.selectedPlayerId===p.id?null:p.id}).catch(()=>{})}><span><ChampionImage champions={champions} id={p.championId}/><span><strong>{p.name}</strong><small>{p.role} · {p.championName}</small></span></span><span title={statsDetail(p)}>{statsAvailable(p)?playerKda(p):'—'}<small> · {statsLabel(p)}</small></span><span title={statsDetail(p)}>{statsAvailable(p)?p.cs:'—'}</span><span title={state.mode==='demo'?'虚构演示数据':p.goldSource==='ocr'?`观战计分板 OCR · ${p.goldSampledAt||''} · 累计金币`:p.goldSource==='api'?'客户端累计金币':'等待累计金币采集'}>{gold(p.gold)}</span></button>)}</div>)}</div><p className="data-source-note">{state.mode==='demo'?'当前显示虚构演示数据。':'选手与英雄来自当前对局；KDA、补刀和累计经济按各行采集来源更新。'} 战队名称与简称沿用赛事设置，可在“赛事与素材”中编辑。鼠标悬停统计数据可查看来源与采样时间。</p></section></div>
    <aside className="studio-aside"><section className="panel sources-panel"><div className="panel-head"><h2><Radio size={16}/>信号源</h2><button className="icon-button" title="配置连接" onClick={onSettings}><Settings2 size={15}/></button></div>{(Object.keys(connectionNames) as (keyof typeof connectionNames)[]).map(key=><div className="source-row" key={key}><div className={`source-icon ${state.connections[key].status==='connected'?'is-connected':''}`}>{key==='obs'?<Monitor size={16}/>:key==='lcu'?<Gamepad2 size={16}/>:key==='replay'?<Play size={16}/>:<Activity size={16}/>}</div><div><strong>{connectionNames[key]}</strong><small>{state.connections[key].status==='connected'?'已连接':state.connections[key].status==='connecting'?'正在连接':state.mode==='demo'&&['lcu','live'].includes(key)?'演示数据驱动':key==='replay'?'仅回放可用':'未连接'}</small></div><span className={`status-dot ${state.connections[key].status==='connected'?'green':'gray'}`}/></div>)}<button className="source-config" onClick={onSettings}>管理数据源<ChevronRight size={14}/></button></section>
    <section className="panel metrics-panel"><div className="panel-head"><h2><AudioLines size={16}/>对局速览</h2><span className="badge">{state.mode==='demo'?'演示':'实况'}</span></div><div className="metric-score"><strong className="blue-text">{teamKills('blue')}</strong><span>击杀</span><strong className="red-text">{teamKills('red')}</strong></div><div className="metric-split"><div><span>总经济</span><b className="blue-text">{gold(state.stats.blue.gold)}</b></div><div><span>总经济</span><b className="red-text">{gold(state.stats.red.gold)}</b></div></div><div className="gold-meter"><i style={{width:`${state.stats.blue.gold&&state.stats.red.gold?100*state.stats.blue.gold/(state.stats.blue.gold+state.stats.red.gold):50}%`}}/></div><div className="objective-summary"><span>防御塔 <b>{state.stats.blue.towers} : {state.stats.red.towers}</b></span><span>巨龙 <b>{state.stats.blue.dragons} : {state.stats.red.dragons}</b></span></div></section>
    <section className="panel events-panel"><div className="panel-head"><h2><Activity size={16}/>事件时间线</h2><span className="event-count">{state.events.length}</span></div><div className="event-tabs"><button className={eventFilter==='all'?'active':''} onClick={()=>setEventFilter('all')}>全部</button><button className={eventFilter==='objective'?'active':''} onClick={()=>setEventFilter('objective')}>地图资源</button></div><div className="event-feed">{state.events.filter(e=>eventFilter==='all'||/dragon|baron|tower|herald/i.test(e.type)).slice(-7).reverse().map(e=><div className="event-row" key={e.id}><span className={`event-line-dot ${e.team||''}`}/><div><small>{time(e.time)} <span>{e.type}</span></small><p>{e.text}</p></div></div>)}{!state.events.length&&<div className="empty-state"><Activity size={26}/><p>等待游戏事件</p><small>对局开始后，关键事件会出现在这里</small></div>}</div><button className="record-button" onClick={()=>void send({type:'save-recording'}).then(()=>notify('当前对局快照已保存到比赛记录')).catch(()=>{})}><ArrowDownToLine size={14}/>保存对局快照</button></section>
    <div className="tip-card"><div><Focus size={18}/><strong>把镜头留给精彩</strong></div><p>数字键选择预监场景，按 Enter 切入节目。待播配置在整体切入后进入节目。</p><span>导播快捷操作 <ArrowRight size={13}/></span></div></aside></div></>}</details></>;
}
