import { useEffect, useRef, useState } from 'react';
import type { BroadcastState } from '../../shared/types';
import { cameraAt, defaultController } from '../../shared/cinematics';
import type { CameraController, CameraKeyframe, CameraTrack, CinematicView, ControllerMode } from '../../shared/cinematics';
import { api } from '../lib';
import { ObsLivePreview } from './ObsLivePreview';
import './cinematic-workspace.css';

const emptyTrack=():CameraTrack=>({id:crypto.randomUUID(),name:'新镜头轨迹',frames:[]});
const bindingNames:Record<keyof CameraController['bindings'],string>={moveX:'横向移动轴',moveZ:'前后移动轴',yaw:'水平转动轴',pitch:'俯仰轴',up:'上升按钮',down:'下降按钮',next:'下个选手',previous:'上个选手',play:'播放轨迹',stop:'停止轨迹',capture:'抓取关键帧'};

export function CinematicWorkspace({state,disabled=false}:{state:BroadcastState;disabled?:boolean}) {
  const [view,setView]=useState<CinematicView>(),[track,setTrack]=useState<CameraTrack>(emptyTrack),[dirty,setDirty]=useState(false),[selected,setSelected]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[armed,setArmed]=useState(false),[mode,setMode]=useState<ControllerMode>('free');
  const [padName,setPadName]=useState('手柄未启用'),[controller,setController]=useState<CameraController>(defaultController),[controllerDirty,setControllerDirty]=useState(false),[target,setTarget]=useState('');
  const operation=useRef(false),viewRef=useRef(view),trackRef=useRef(track),targetRef=useRef(target),controllerRef=useRef(controller),dirtyRef=useRef(false);
  const trackRevision=useRef(0),controllerRevision=useRef(0),controllerDirtyRef=useRef(false);
  const root=useRef<HTMLElement>(null),initialized=useRef(false),file=useRef<HTMLInputElement>(null);
  viewRef.current=view;trackRef.current=track;targetRef.current=target;controllerRef.current=controller;dirtyRef.current=dirty;controllerDirtyRef.current=controllerDirty;
  const loadView=(next:CinematicView)=>{
    setView(next);viewRef.current=next;
    if(!initialized.current){initialized.current=true;setController(next.library.controller);if(next.library.tracks[0])setTrack(next.library.tracks[0]);trackRevision.current=next.library.revision;controllerRevision.current=next.library.revision;return;}
    if(!dirtyRef.current){const saved=next.library.tracks.find(t=>t.id===trackRef.current.id);if(saved)setTrack(saved);trackRevision.current=next.library.revision;}
    if(!controllerDirtyRef.current){setController(next.library.controller);controllerRevision.current=next.library.revision;}
  };
  const refresh=async()=>{try{loadView(await api<CinematicView>('/api/cinematics'));}catch(e){setError(e instanceof Error?e.message:'镜头连接失败');}};
  useEffect(()=>{void refresh();const timer=setInterval(()=>{if(!operation.current&&!document.hidden&&!root.current?.closest('[hidden]'))void refresh();},3000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(disabled)setArmed(false);},[disabled]);
  const run=async(body:Record<string,unknown>,quiet=false):Promise<CinematicView|undefined>=>{
    if(operation.current||disabled)return;operation.current=true;if(!quiet)setBusy(true);setError('');
    try{const next=await api<CinematicView>('/api/cinematics',{method:'POST',body:JSON.stringify({session:viewRef.current?.session,expectedRevision:viewRef.current?.library.revision,...body})});loadView(next);return next;}
    catch(e){setError(e instanceof Error?e.message:'镜头操作失败');if(quiet)setArmed(false);return undefined;}
    finally{operation.current=false;if(!quiet)setBusy(false);}
  };
  const capture=async()=>{const next=await run({action:'capture'});if(next?.captured){setTrack(t=>({...t,frames:[...t.frames,next.captured!].sort((a,b)=>a.time-b.time)}));setSelected(next.captured.id);setDirty(true);}};
  const save=async()=>{const next=await run({action:'save',track:trackRef.current,expectedRevision:trackRevision.current});if(next){setTrack(next.library.tracks.find(t=>t.id===trackRef.current.id)!);trackRevision.current=next.library.revision;setDirty(false);}};
  const updateFrame=(id:string,patch:Partial<CameraKeyframe>)=>{setTrack(t=>({...t,frames:t.frames.map(f=>f.id===id?{...f,...patch}:f)}));setDirty(true);};
  const current=track.frames.find(f=>f.id===selected)??track.frames[0],available=!!view?.connected&&!disabled&&!busy;
  const names=state.players.map(p=>p.name).filter(Boolean);
  useEffect(()=>{if(!target&&names[0])setTarget(names[0]);},[names.join('|')]);
  useEffect(()=>{
    if(!armed||disabled)return;
    let stopped=false,last=performance.now(),buttons:boolean[]=[],padIndex=-1;
    const timer=setInterval(async()=>{
      const now=performance.now(),dt=Math.min(.2,Math.max(.01,(now-last)/1000));last=now;
      if(stopped||document.hidden||root.current?.closest('[hidden]')||operation.current||!viewRef.current?.connected)return;
      const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected);if(!pad){setPadName('等待连接手柄');buttons=[];return;}
      if(pad.index!==padIndex){padIndex=pad.index;buttons=pad.buttons.map(b=>b.pressed);setPadName(pad.id);return;}
      setPadName(pad.id);const config=controllerRef.current,b=config.bindings;
      const pressed=(id:number)=>!!pad.buttons[id]?.pressed&&!buttons[id];const pressedButtons=pad.buttons.map(value=>value.pressed);
      if(pressed(b.stop)){buttons=pressedButtons;await run({action:'stop'},true);return;}
      if(pressed(b.capture)){buttons=pressedButtons;await capture();return;}
      if(pressed(b.play)){buttons=pressedButtons;if(dirtyRef.current){setError('先保存镜头轨迹，再通过手柄播放');return;}await run({action:'play',trackId:trackRef.current.id},true);return;}
      if(mode==='directed'&&(pressed(b.next)||pressed(b.previous))){const index=Math.max(0,names.indexOf(targetRef.current)),name=names[(index+(pressed(b.next)?1:names.length-1))%names.length];buttons=pressedButtons;if(name){setTarget(name);await run({action:'follow',name},true);}return;}
      buttons=pressedButtons;if(mode==='directed')return;
      const axis=(id:number)=>{const v=pad.axes[id]??0;return Math.abs(v)<=config.deadzone?0:Math.sign(v)*(Math.abs(v)-config.deadzone)/(1-config.deadzone);};
      const axes={x:axis(b.moveX),z:-axis(b.moveZ),yaw:axis(b.yaw),pitch:axis(b.pitch)*(config.invertY?-1:1),y:(pad.buttons[b.up]?.pressed?1:0)-(pad.buttons[b.down]?.pressed?1:0)};
      if(Object.values(axes).some(v=>v!==0))await run({action:'nudge',mode,axes,dt},true);
    },100);
    return()=>{stopped=true;clearInterval(timer);};
  },[armed,mode,disabled,names.join('|')]);
  const exportTrack=()=>{const blob=new Blob([JSON.stringify(track,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='riftcast-camera-'+track.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const importTrack=async(value?:File)=>{if(!value)return;if(value.size>256000){setError('镜头文件最多 256 KB');return;}try{const p=JSON.parse(await value.text());if(!p||typeof p.name!=='string'||!Array.isArray(p.frames)||p.frames.length>100||p.frames.some((f:any)=>!f||typeof f.time!=='number'||!Number.isFinite(f.time)||!['position','rotation'].every(k=>f[k]&&['x','y','z'].every(axis=>typeof f[k][axis]==='number'&&Number.isFinite(f[k][axis])))))throw new Error();setTrack({...p,id:crypto.randomUUID(),frames:p.frames.map((f:CameraKeyframe)=>({...f,id:crypto.randomUUID()}))});setDirty(true);setSelected('');}catch{setError('镜头文件格式无效');}};
  return <section className="cinematic-workspace" ref={root} aria-label="电影镜头与手柄">
    <header className="cinematic-heading"><div><h3>电影镜头与手柄</h3><p>在游戏回放中编辑轨迹；播放、跳转和跟随直接作用于当前游戏画面。</p></div><span className={`badge ${view?.connected?'connected':''}`}>{view?.connected?'镜头已连接':'等待回放'}</span><button className="button small" onClick={()=>void refresh()}>刷新连接</button></header>
    {error&&<p className="request-error" role="alert">{error}</p>}<p className="muted" role="status">{view?.detail??'正在读取镜头库'}</p>
    <div className="cinematic-layout"><div className="cinematic-editor">
      <div className="cinematic-toolbar"><label>镜头库<select aria-label="已保存镜头轨迹" value={view?.library.tracks.some(t=>t.id===track.id)?track.id:''} disabled={busy||dirty} onChange={e=>{const next=view?.library.tracks.find(t=>t.id===e.target.value);if(next){setTrack(structuredClone(next));setSelected('');}}}><option value="">未保存轨迹</option>{view?.library.tracks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button className="button small" disabled={busy||dirty||disabled} onClick={()=>{setTrack(emptyTrack());setDirty(false);setSelected('');}}>新建</button><button className="button small" disabled={busy||disabled||!view?.library.tracks.some(t=>t.id===track.id)} onClick={()=>void run({action:'delete',trackId:track.id}).then(next=>{if(next){setTrack(next.library.tracks[0]??emptyTrack());setDirty(false);setSelected('');}})}>删除轨迹</button></div>
      <label className="field">轨迹名称<input value={track.name} maxLength={100} disabled={disabled} onChange={e=>{setTrack(t=>({...t,name:e.target.value}));setDirty(true);}}/></label>
      <CameraPath track={track}/>
      <div className="cinematic-toolbar"><button className="button" disabled={!available} onClick={()=>void capture()}>抓取当前镜头</button><button className="button primary" disabled={disabled||busy||!view} onClick={()=>void save()}>{dirty?'保存修改':'保存轨迹'}</button><button className="button" disabled={!available||dirty||track.frames.length<2||!view?.library.tracks.some(t=>t.id===track.id)} onClick={()=>void run({action:'play',trackId:track.id})}>游戏内播放</button><button className="button" disabled={!available} onClick={()=>void run({action:'stop'})}>停止轨迹</button></div>
      {dirty&&<p className="muted">关键帧已修改，保存后可播放。切换轨迹前请保存，或点击“恢复已保存”。<button className="button small" onClick={()=>{setTrack(structuredClone(view?.library.tracks.find(t=>t.id===track.id)??emptyTrack()));trackRevision.current=view?.library.revision??0;setDirty(false);setSelected('');}}>恢复已保存</button></p>}
      <div className="cinematic-frames" aria-label="镜头关键帧列表">{track.frames.map((frame,index)=><button className={`cinematic-frame ${current?.id===frame.id?'selected':''}`} key={frame.id} onClick={()=>setSelected(frame.id)}><strong>{index+1}</strong><span>{frame.time.toFixed(2)} s</span><small>{frame.interpolation==='spline'?'样条':frame.interpolation==='cut'?'跳切':'线性'}</small></button>)}{!track.frames.length&&<p className="muted">在游戏中移动镜头，再抓取两个以上关键帧。</p>}</div>
      {current&&<fieldset className="cinematic-frame-fields" disabled={disabled||busy}><legend>关键帧参数</legend><label>游戏时间（秒）<input type="number" min="0" max="86400" step=".05" value={current.time} onChange={e=>updateFrame(current.id,{time:Number(e.target.value)})}/></label><label>至下一帧<select value={current.interpolation} onChange={e=>updateFrame(current.id,{interpolation:e.target.value as CameraKeyframe['interpolation']})}><option value="spline">平滑样条</option><option value="linear">线性移动</option><option value="cut">保持后跳切</option></select></label>{(['position','rotation'] as const).map(group=>(['x','y','z'] as const).map(axis=><label key={group+axis}>{group==='position'?'位置':'旋转'} {axis.toUpperCase()}<input aria-label={`${group==='position'?'位置':'旋转'} ${axis.toUpperCase()}`} type="number" step="1" value={current[group][axis]} onChange={e=>updateFrame(current.id,{[group]:{...current[group],[axis]:Number(e.target.value)}})}/></label>))}<label>视野角度<input type="number" min="1" max="179" value={current.fov} onChange={e=>updateFrame(current.id,{fov:Number(e.target.value)})}/></label><div className="cinematic-toolbar"><button className="button small" disabled={!available} onClick={()=>void run({action:'jump',pose:current})}>跳至此镜头</button><button className="button small" onClick={()=>{setTrack(t=>({...t,frames:t.frames.filter(f=>f.id!==current.id)}));setDirty(true);setSelected('');}}>删除此帧</button></div></fieldset>}
      <div className="cinematic-toolbar"><button className="button small" onClick={exportTrack}>导出轨迹 JSON</button><button className="button small" disabled={disabled||dirty} onClick={()=>file.current?.click()}>导入轨迹</button><input ref={file} hidden type="file" accept=".json,application/json" onChange={e=>{void importTrack(e.target.files?.[0]);e.target.value='';}}/></div>
    </div><aside className="cinematic-monitor"><h4>游戏合成预览</h4><ObsLivePreview kind="program" connected={state.connections.obs.status==='connected'} enabled/><p className="muted">预览显示 OBS 当前节目合成；轨迹在游戏内执行。</p><div className="cinematic-camera-readout">{view?.pose&&<><span>游戏时间 {view.playback?.time.toFixed(2)} s</span><span>位置 {Object.values(view.pose.position).map(v=>v.toFixed(1)).join(' / ')}</span><span>角度 {Object.values(view.pose.rotation).map(v=>v.toFixed(1)).join(' / ')}</span></>}</div>
      <h4>选手镜头与自动跟随</h4><label className="field">跟随目标<select value={target} onChange={e=>setTarget(e.target.value)}>{names.map((name,i)=><option key={name+i}>{name}</option>)}</select></label><div className="cinematic-toolbar"><button className="button" disabled={!available||!target} onClick={()=>void run({action:'follow',name:target})}>跟随选手</button><button className="button" disabled={!available} aria-pressed={view?.autoFollow??false} onClick={()=>void run({action:'auto',enabled:!view?.autoFollow})}>{view?.autoFollow?'停止自动跟随':'自动跟随新事件'}</button></div><p className="muted">自动跟随新出现的击杀者或资源获取者。手动镜头操作后自动跟随停止。</p>
      <h4>手柄控制</h4><label className="field">镜头模式<select value={mode} onChange={e=>setMode(e.target.value as ControllerMode)}><option value="directed">选手跟随</option><option value="free">自由镜头</option><option value="dolly">轨道推进</option></select></label><button className={`button ${armed?'primary':''}`} disabled={!available||controllerDirty} aria-pressed={armed} onClick={()=>setArmed(v=>!v)}>{armed?'停用手柄':'启用手柄'}</button><p className="muted">{armed?padName:'手柄已停用'}。页面隐藏或失去控制权限后暂停接收。</p>
      <details><summary>手柄绑定与速度</summary><fieldset className="cinematic-bindings" disabled={disabled||busy||armed}>{(Object.keys(bindingNames) as (keyof CameraController['bindings'])[]).map(key=><label key={key}>{bindingNames[key]}<input type="number" min="0" max={['moveX','moveZ','yaw','pitch'].includes(key)?15:31} value={controller.bindings[key]} onChange={e=>{setController(c=>({...c,bindings:{...c.bindings,[key]:Number(e.target.value)}}));setControllerDirty(true);}}/></label>)}<label>摇杆死区<input type="number" min="0" max=".8" step=".01" value={controller.deadzone} onChange={e=>{setController(c=>({...c,deadzone:Number(e.target.value)}));setControllerDirty(true);}}/></label><label>移动速度 / 秒<input type="number" min="1" max="10000" value={controller.moveSpeed} onChange={e=>{setController(c=>({...c,moveSpeed:Number(e.target.value)}));setControllerDirty(true);}}/></label><label>转动角度 / 秒<input type="number" min="1" max="360" value={controller.lookSpeed} onChange={e=>{setController(c=>({...c,lookSpeed:Number(e.target.value)}));setControllerDirty(true);}}/></label><label className="cinematic-check"><input type="checkbox" checked={controller.invertY} onChange={e=>{setController(c=>({...c,invertY:e.target.checked}));setControllerDirty(true);}}/>反转俯仰</label><button className="button small" disabled={!controllerDirty} onClick={()=>void run({action:'controller',controller,expectedRevision:controllerRevision.current}).then(next=>{if(next){setController(next.library.controller);controllerRevision.current=next.library.revision;setControllerDirty(false);}})}>保存手柄绑定</button></fieldset><p className="muted">轴与按钮编号从 0 开始。轨道模式固定朝向与高度，左摇杆前后推进，右摇杆调整俯仰。</p></details>
    </aside></div>
  </section>;
}
function CameraPath({track}:{track:CameraTrack}) {
  const sorted=[...track.frames].sort((a,b)=>a.time-b.time),points=sorted.length>1?Array.from({length:120},(_,i)=>cameraAt(sorted,sorted[0].time+(sorted.at(-1)!.time-sorted[0].time)*i/119).position):sorted.map(f=>f.position);
  if(!points.length)return <div className="cinematic-path cinematic-empty">轨迹平面图 · 抓取镜头后显示 X / Z 路径</div>;
  const x0=Math.min(...points.map(p=>p.x)),x1=Math.max(...points.map(p=>p.x)),z0=Math.min(...points.map(p=>p.z)),z1=Math.max(...points.map(p=>p.z));
  const xy=(p:{x:number;z:number})=>`${30+(p.x-x0)/Math.max(1,x1-x0)*540},${160-(p.z-z0)/Math.max(1,z1-z0)*130}`;
  return <svg className="cinematic-path" viewBox="0 0 600 190" role="img" aria-label="镜头 X Z 平面路径"><polyline points={points.map(xy).join(' ')} fill="none" stroke="currentColor" strokeWidth="2"/>{sorted.map((frame,i)=>{const [x,y]=xy(frame.position).split(',');return <g key={frame.id}><circle cx={x} cy={y} r="5" fill="currentColor"/><text x={Number(x)+8} y={Number(y)-8} fill="currentColor" fontSize="12">{i+1}</text></g>;})}<text x="12" y="184" fill="currentColor" fontSize="11">X / Z 平面 · 世界坐标</text></svg>;
}
