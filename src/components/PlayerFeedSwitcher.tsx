import {programState} from '../../shared/production';
import {TakeControl} from './ConsoleUI';
import { useState, useEffect } from 'react';
import { Camera, Play, Pause } from 'lucide-react';
import type { StateContext } from '../../shared/types';
import { playerFeedControl, playerFeedRoles, resolvedPlayerFeed } from '../../shared/player-feeds';
import './player-feed-switcher.css';

/** Instant director controls are separate from the editable material settings. */
export function PlayerFeedSwitcher(ctx: StateContext) {
  const {state,send,notify}=ctx;
  const control = playerFeedControl(state.overlay),program=playerFeedControl(programState(state).overlay);
  const [now,setNow]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
  const hold=state.production?.pause?'比赛暂停':state.production?.playingClipId?'回放播出':state.programScene==='teamfight'?'团战视图':state.production?.feedHold?'人工保持':state.programScene!=='live'?'当前场景无选手画面':'';
  const [busy, setBusy] = useState(false);
  async function change(mode: 'manual' | 'auto', activeIndex = control.activeIndex) {
    setBusy(true);
    try {
      await send({ type: 'set-player-feed-control', mode, activeIndex });
      notify(mode === 'auto' ? '5 秒轮播已设为待播，请核对后整体切入' : `${playerFeedRoles[activeIndex]}对位已设为待播`);
    } catch { /* send already reports the request failure */ }
    finally { setBusy(false); }
  }
  return <section className="panel player-feed-switcher" aria-label="选手画面切换">
    <div className="panel-head"><div><h2><Camera size={16} />选手画面准备</h2><p className="muted">待播：{playerFeedRoles[control.activeIndex]} · {control.mode === 'auto' ? '每 5 秒自动轮播' : '手动固定'}。选择后在预监核对，整体切入后进入节目。</p></div>
      <button className={`button small ${control.mode === 'auto' ? 'primary' : ''}`} disabled={busy} onClick={() => void change(control.mode === 'auto' ? 'manual' : 'auto')}>{control.mode === 'auto' ? <Pause size={14} /> : <Play size={14} />}{control.mode === 'auto' ? '停止轮播' : '5 秒自动轮播'}</button></div>
    <div className="feed-onair-summary">PGM：{playerFeedRoles[program.activeIndex]} · {hold?`保持：${hold}`:program.mode==='auto'?`轮播剩余 ${Math.max(0,Math.ceil(((program.nextSwitchAt??now)-now)/1000))} 秒`:'手动固定'}<br/>PVW：{playerFeedRoles[control.activeIndex]} · {control.mode==='auto'?'自动轮播':'手动固定'}</div><label className="toggle-setting"><span>保持当前对位</span><input type="checkbox" checked={state.production?.feedHold??false} onChange={e=>void send({type:'production',command:{op:'settings',feedHold:e.target.checked}}).catch(()=>{})}/></label>
    <div className="player-feed-pair-buttons">{playerFeedRoles.map((role, index) => <button key={role} type="button" disabled={busy} className={index === control.activeIndex ? 'selected' : ''} aria-pressed={index === control.activeIndex} aria-label={`准备${role}对位`} onClick={() => void change('manual', index)}>
      <div className="feed-pair-thumbnail">{(['blue','red'] as const).map(side=>{const feed=resolvedPlayerFeed(state,side,index);return feed.imageUrl?<img key={side} src={feed.imageUrl} alt={`${side==='blue'?'蓝':'红'}方 ${role} 照片`} style={{objectPosition:`${feed.focusX??50}% ${feed.focusY??35}%`}}/>:<small key={side}>{feed.mode==='camera'?'摄像头':feed.mode==='off'?'已隐藏':'无照片'}</small>;})}</div><strong>{role}{program.activeIndex===index?' · PGM':''}</strong><span className="blue-text">{resolvedPlayerFeed(state, 'blue', index).label || '蓝方待设置'}</span><span className="red-text">{resolvedPlayerFeed(state, 'red', index).label || '红方待设置'}</span>
    </button>)}</div>
    <TakeControl {...ctx} scene="live" compact/>
  </section>;
}
