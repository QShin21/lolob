import {programState} from '../../shared/production';
import {TakeControl} from './ConsoleUI';
import { useState, useEffect } from 'react';
import { Camera, EyeOff, ImageOff, Play, Pause } from 'lucide-react';
import type { StateContext } from '../../shared/types';
import { playerFeedControl, playerFeedHoldReason, playerFeedRoles, resolvedPlayerFeed } from '../../shared/player-feeds';
import './task-panels.css';
import './player-feed-switcher.css';

/** Instant director controls are separate from the editable material settings. */
export function PlayerFeedSwitcher(ctx: StateContext) {
  const {state,send,notify}=ctx;
  const control = playerFeedControl(state.overlay),program=playerFeedControl(programState(state).overlay);
  const [now,setNow]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  const held=!!state.production?.feedHold;
  const status=(bus:'preview'|'program',value:typeof control)=>{
    const hold=playerFeedHoldReason(state,bus);
    return hold?`保持：${hold}`:value.mode==='auto'?(value.nextSwitchAt===undefined?'轮播即将开始':`轮播剩余 ${Math.max(0,Math.ceil((value.nextSwitchAt-now)/1000))} 秒`):'手动固定';
  };
  const [busy, setBusy] = useState(false);
  async function change(mode: 'manual' | 'auto', activeIndex = control.activeIndex) {
    setBusy(true);
    try {
      await send({ type: 'set-player-feed-control', mode, activeIndex });
      notify(mode === 'auto' ? '已解除人工保持，5 秒轮播已设为待播，请核对后整体切入' : `${playerFeedRoles[activeIndex]}对位已设为待播`);
    } catch { /* send already reports the request failure */ }
    finally { setBusy(false); }
  }
  return <section className="panel player-feed-switcher tpanel" aria-label="选手画面切换">
    <div className="panel-head"><div><h2><Camera size={16} />选手画面准备</h2><p className="muted">待播：{playerFeedRoles[control.activeIndex]} · {control.mode === 'auto' ? '每 5 秒自动轮播' : '手动固定'}。选择后在预监核对，整体切入后进入节目。</p></div>
      <button className={`button small ${control.mode === 'auto' ? 'primary' : ''}`} disabled={busy} onClick={() => void change(control.mode === 'auto'&&!held ? 'manual' : 'auto')}>{control.mode === 'auto'&&!held ? <Pause size={14} /> : <Play size={14} />}{held?'恢复 5 秒轮播':control.mode === 'auto' ? '停止轮播' : '5 秒自动轮播'}</button></div>
    {/* The colon keeps the read-out text contiguous for screen readers and checks; the tally tag replaces it visually. */}
    <div className="feed-onair-summary">
      <div><span className="bus-tag pgm">PGM</span><span><span className="sr-only">：</span><strong>{playerFeedRoles[program.activeIndex]}</strong> · {status('program',program)}</span></div>
      <div><span className="bus-tag pvw">PVW</span><span><span className="sr-only">：</span><strong>{playerFeedRoles[control.activeIndex]}</strong> · {status('preview',control)}</span></div>
    </div><label className="toggle-setting tpanel-toggle tpanel-toggle-closed"><span>保持当前对位</span><input type="checkbox" checked={held} onChange={e=>void send({type:'production',command:{op:'settings',feedHold:e.target.checked}}).catch(()=>{})}/></label>
    <div className="player-feed-pair-buttons">{playerFeedRoles.map((role, index) => <button key={role} type="button" disabled={busy} className={index === control.activeIndex ? 'selected' : ''} aria-pressed={index === control.activeIndex} data-program={program.activeIndex === index ? 'true' : undefined} aria-label={`准备${role}对位`} onClick={() => void change('manual', index)}>
      <div className="feed-pair-thumbnail tpanel-media">{(['blue','red'] as const).map(side => {
        const feed = resolvedPlayerFeed(state, side, index);
        if (feed.imageUrl) return <img key={side} src={feed.imageUrl} alt={`${side==='blue'?'蓝':'红'}方 ${role} 照片`} style={{objectPosition:`${feed.focusX??50}% ${feed.focusY??35}%`}}/>;
        const Icon = feed.mode === 'camera' ? Camera : feed.mode === 'off' ? EyeOff : ImageOff;
        const label = feed.mode === 'camera' ? '摄像头' : feed.mode === 'off' ? '已隐藏' : '无照片';
        return <small className="feed-pair-placeholder" key={side} title={label}><Icon size={14} aria-hidden="true"/><span>{label}</span></small>;
      })}</div>
      <strong>{role}{program.activeIndex === index && <span className="bus-tag pgm">PGM</span>}{index === control.activeIndex && <span className="bus-tag pvw">PVW</span>}</strong>
      <span className="blue-text" title={resolvedPlayerFeed(state, 'blue', index).label || '蓝方待设置'}>{resolvedPlayerFeed(state, 'blue', index).label || '蓝方待设置'}</span>
      <span className="red-text" title={resolvedPlayerFeed(state, 'red', index).label || '红方待设置'}>{resolvedPlayerFeed(state, 'red', index).label || '红方待设置'}</span>
    </button>)}</div>
    <TakeControl {...ctx} scene="live" compact/>
  </section>;
}
