import {useEffect,useRef,useState} from 'react';
import type {ReplayDirectorView,ReplayMoment} from '../../shared/replay-director';
import {advancingReplayTime} from '../../shared/replay-director';
import type {TaskContext} from './ProductionDesk';
import {api,time} from '../lib';
import './game-replay-director.css';

export function GameReplayDirector({host,canOutput,notify,send}:Pick<TaskContext,'host'|'canOutput'|'notify'|'send'>){
 const [view,setView]=useState<ReplayDirectorView>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[position,setPosition]=useState(''),[kind,setKind]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
 const root=useRef<HTMLElement>(null),running=useRef(false),generation=useRef(0);
 const [scrub,setScrub]=useState<number>();
 const [returnTo,setReturnTo]=useState<{time:number;capturedAt:number}>(),[returnClock,setReturnClock]=useState(0);
 useEffect(()=>{if(!returnTo)return;setReturnClock(performance.now());const timer=setInterval(()=>setReturnClock(performance.now()),250);return()=>clearInterval(timer);},[returnTo]);
 useEffect(()=>{setReturnTo(undefined);setSelected('');setScrub(undefined);},[view?.session]);
 useEffect(()=>{let stopped=false,fetching=false;const refresh=async()=>{if(fetching||running.current||document.hidden||root.current?.closest('[hidden]'))return;fetching=true;const token=generation.current;
  try{const v=await api<ReplayDirectorView>('/api/replay/director');if(!stopped&&token===generation.current){setView(v);setError('');}}catch(e){if(!stopped&&token===generation.current){setView(undefined);setError(e instanceof Error?e.message:'回放连接失败');}}finally{fetching=false;}};
  void refresh();const timer=setInterval(refresh,1000);return()=>{stopped=true;clearInterval(timer);};},[]);
 const control=async(body:Record<string,unknown>)=>{if(running.current||!view?.connected)return;running.current=true;generation.current++;setBusy(true);setError('');
  try{setView(await api<ReplayDirectorView>('/api/replay/director',{method:'POST',body:JSON.stringify({session:view.session,...body})}));}
  catch(e){const message=e instanceof Error?e.message:'回放操作失败';setError(message);notify(message,'error');}finally{running.current=false;setBusy(false);setScrub(undefined);}};
 const playback=view?.playback,disabled=!host||!canOutput||!view?.connected||!playback||busy||!!playback.seeking;
 const jump=()=>{const match=position.trim().match(/^(\d+)(?::([0-5]\d))?$/);if(!match){setError('请输入秒数或 分:秒，例如 12:30');return;}const t=match[2]===undefined?Number(match[1]):Number(match[1])*60+Number(match[2]);void control({time:t,paused:false});};
 const events=view?.moments.filter(e=>(kind==='all'||e.kind===kind)&&`${e.title} ${time(e.time)} ${time(e.start)}`.toLowerCase().includes(search.toLowerCase()))??[];
 const choose=(event:ReplayMoment)=>{if(playback&&!returnTo){const at=performance.now();setReturnClock(at);setReturnTo({time:playback.time,capturedAt:at});}setSelected(event.id);void control({eventId:event.id});};
 const returnTime=(now:number)=>returnTo?advancingReplayTime(returnTo.time,now-returnTo.capturedAt,playback?.length??view?.coverageUntil):0;
 return <section className="game-replay-director" ref={root} aria-label="游戏回放控制">
  <div className="replay-director-heading"><h3>游戏回放 · 事件导航</h3><span>{playback?.seeking?'正在跳转':view?.connected?'已连接':'等待连接'}</span></div>
  <p className="muted">直接控制当前游戏画面，节目与预监会同步跳转。</p>
  <fieldset disabled={disabled}><div className="replay-transport"><button className="button" aria-label="后退十秒" onClick={()=>void control({time:Math.max(0,(playback?.time??0)-10)})}>−10s</button><button className="button primary" onClick={()=>void control({paused:!playback?.paused})}>{playback?.paused?'播放':'暂停'}</button><button className="button" aria-label="前进十秒" onClick={()=>void control({time:Math.min(playback?.length??view?.coverageUntil??0,(playback?.time??0)+10)})}>+10s</button><select aria-label="游戏回放倍速" value={playback?.speed??1} onChange={e=>void control({speed:Number(e.target.value)})}>{[.25,.5,1,2,4,8].map(n=><option key={n} value={n}>{n}×</option>)}</select></div>
  <div className="replay-seek"><span aria-label="游戏回放时间">{time(playback?.time??0)} / {time(playback?.length??view?.coverageUntil??0)}</span><input aria-label="跳转时间" placeholder="12:30 或秒数" value={position} onChange={e=>setPosition(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')jump();}}/><button className="button" onClick={jump}>跳转</button></div>
  <input className="replay-progress" aria-label="游戏回放进度" type="range" min={0} max={playback?.length??view?.coverageUntil??0} step={1} value={scrub??playback?.time??0} onChange={e=>setScrub(Number(e.target.value))} onPointerUp={e=>void control({time:Number(e.currentTarget.value),paused:false})} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key))void control({time:Number(e.currentTarget.value),paused:false});}}/>
  {returnTo&&<button className="button small" title="原时间线按正常 1 倍速推进，返回后正常播放" onClick={()=>void control({time:returnTime(performance.now()),paused:false,speed:1})}>返回原进度 · {time(returnTime(returnClock))}</button>}
  </fieldset>
  <div className="replay-scene-buttons"><button className="button small" disabled={!host||!canOutput||busy} onClick={()=>void send({type:'take',scene:'teamfight'}).catch(()=>{})}>切入团战视图</button><button className="button small" disabled={!host||!canOutput||busy} onClick={()=>void send({type:'take',scene:'live'}).catch(()=>{})}>返回局内计分板</button></div>
  {error&&<p role="alert" className="request-error">{error}</p>}
  <div className="replay-event-filter"><select aria-label="回放事件类型" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部事件</option><option value="kill">英雄击杀</option><option value="objective">中立资源</option><option value="teamfight">团战</option></select><input aria-label="搜索回放事件" placeholder="选手、资源或时间" value={search} onChange={e=>setSearch(e.target.value)}/><span>{events.length} 条</span></div>
  <div className="replay-event-list" aria-label="游戏事件列表">{events.map(e=><button key={e.id} disabled={disabled} className={`replay-event ${e.kind}`} aria-pressed={selected===e.id} onClick={()=>choose(e)}><span className="replay-event-time">{time(e.time)}<small>{e.kind==='teamfight'?'团战':e.kind==='kill'?'击杀':'资源'}</small></span><span><strong>{e.title}</strong><small>从 {time(e.start)} 开始 · {e.basis==='damage'?(e.kind==='teamfight'?'首轮伤害前 5 秒':'交战起点前 3 秒'):'事件前 3 秒（伤害起点待确认）'}</small></span></button>)}{!events.length&&<p className="muted">{view?.connected?'当前筛选下暂无已识别事件。':'打开国服回放后，事件会显示在这里。'}</p>}</div>
  <details><summary>事件识别与采集范围</summary><p>{view?.detail??'等待读取游戏数据'}</p><p>击杀按受害者连续受伤段定位，超过 8 秒无伤害视为新一轮交战。团战要求同一交战链中双方各至少两人、合计至少五人，前奏为首次伤害前 5 秒。</p><p>中立资源优先使用游戏事件，缺失时由连续播放期间的资源计数变化补充。未取得伤害起点的事件会标注估计定位。</p></details>
 </section>;
}
