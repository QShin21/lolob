import { useState } from 'react';
import { Camera, Play, Pause } from 'lucide-react';
import type { StateContext } from '../../shared/types';
import { playerFeedControl, playerFeedRoles, resolvedPlayerFeed } from '../../shared/player-feeds';
import './player-feed-switcher.css';

/** Instant director controls are separate from the editable material settings. */
export function PlayerFeedSwitcher({ state, send, notify }: StateContext) {
  const control = playerFeedControl(state.overlay);
  const [busy, setBusy] = useState(false);
  async function change(mode: 'manual' | 'auto', activeIndex = control.activeIndex) {
    setBusy(true);
    try {
      await send({ type: 'set-player-feed-control', mode, activeIndex });
      notify(mode === 'auto' ? '选手画面已开启 5 秒自动轮播' : `${playerFeedRoles[activeIndex]}对位已手动切入`);
    } catch { /* send already reports the request failure */ }
    finally { setBusy(false); }
  }
  return <section className="panel player-feed-switcher" aria-label="选手画面切换">
    <div className="panel-head"><div><h2><Camera size={16} />选手画面切换</h2><p className="muted">当前：{playerFeedRoles[control.activeIndex]} · {control.mode === 'auto' ? '每 5 秒自动轮播' : '手动固定'}。点击对位即可切入并固定。</p></div>
      <button className={`button small ${control.mode === 'auto' ? 'primary' : ''}`} disabled={busy} onClick={() => void change(control.mode === 'auto' ? 'manual' : 'auto')}>{control.mode === 'auto' ? <Pause size={14} /> : <Play size={14} />}{control.mode === 'auto' ? '停止轮播' : '5 秒自动轮播'}</button></div>
    <div className="player-feed-pair-buttons">{playerFeedRoles.map((role, index) => <button key={role} type="button" disabled={busy} className={index === control.activeIndex ? 'selected' : ''} aria-pressed={index === control.activeIndex} aria-label={`手动切入${role}对位`} onClick={() => void change('manual', index)}>
      <strong>{role}</strong><span className="blue-text">{resolvedPlayerFeed(state, 'blue', index).label || '蓝方待设置'}</span><span className="red-text">{resolvedPlayerFeed(state, 'red', index).label || '红方待设置'}</span>
    </button>)}</div>
  </section>;
}
