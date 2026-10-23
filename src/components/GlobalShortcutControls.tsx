import { useEffect, useState } from 'react';
import type { StateContext } from '../../shared/types';
import { productionDefaults } from '../../shared/production';
import { globalShortcutLabels, initialGlobalShortcutStatus } from '../../shared/global-shortcuts';
import { casterBindings, type CasterBaseAction } from '../../shared/caster-controls';
import type { ProductionState } from '../../shared/production-types';
import { CasterControls } from './CasterControls';
import './global-shortcuts.css';

export function GlobalShortcutControls({ state, seat, connected, send, notify }: Pick<StateContext, 'state' | 'seat' | 'connected' | 'send' | 'notify'>) {
  const [status, setStatus] = useState(initialGlobalShortcutStatus);
  const [draft, setDraft] = useState<ProductionState['hotkeys'] | null>(null);
  const [busy, setBusy] = useState(false);
  const desktop = window.riftcastDesktop;
  const production = state.production ?? productionDefaults();
  const keys = draft ?? production.hotkeys;
  const owner = connected !== false && seat?.role === 'director' && production.control?.owner === seat.id;
  useEffect(() => {
    let active = true;
    if (!desktop) return;
    const unsubscribe = desktop.onGlobalShortcutStatus(value => { if (active) setStatus(value); });
    void desktop.globalShortcuts({ action: 'status' }).then(value => { if (active) setStatus(value); }).catch(error => notify(error.message, 'error'));
    return () => { active = false; unsubscribe(); };
  }, [desktop, notify]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try { await operation(); } catch (error) { notify(error instanceof Error ? error.message : String(error), 'error'); }
    finally { setBusy(false); }
  };
  const save = () => void run(async () => {
    const values = Object.values(keys);
    if (values.some(value => !/^(Control\+Shift\+[A-Z]|Control\+Enter|Alt\+Shift\+[A-Z])$/.test(value)) || new Set(values).size !== values.length) throw new Error('请使用互不重复的 Control+Shift+字母、Alt+Shift+字母或 Control+Enter');
    if (desktop) setStatus(await desktop.globalShortcuts({ action: 'disable' }));
    await send({ type: 'production', command: { op: 'settings', hotkeys: keys } });
    setDraft(null); notify('快捷键已保存，需要后台操作时请启用');
  });
  return <><section className="global-shortcuts" aria-label="后台全局快捷键">
    <div className="global-shortcuts-heading"><div><h3>后台全局快捷键</h3><p>桌面程序在后台时可执行导播动作和已配置的解说按钮。每次启动默认关闭，启用后持续核对主导播控制权。</p></div><span className={status.enabled ? 'global-shortcuts-active' : ''}>{status.enabled ? '系统已注册' : '已关闭'}</span></div>
    {!desktop && <p className="global-shortcuts-notice">后台注册需要从 RiftCast 桌面程序打开；浏览器窗口内快捷键可继续使用。</p>}
    <div className="global-shortcuts-grid">{(Object.keys(globalShortcutLabels) as CasterBaseAction[]).map(action => <label key={action}>{globalShortcutLabels[action]}<input aria-label={`${globalShortcutLabels[action]}快捷键`} value={keys[action]} disabled={!owner || busy} onChange={event => setDraft({ ...keys, [action]: event.target.value })} onKeyDown={event => {
      if (event.ctrlKey || event.altKey) {
        event.preventDefault(); event.stopPropagation();
        if (event.key.length === 1 || event.key === 'Enter') setDraft({ ...keys, [action]: [event.ctrlKey ? 'Control' : '', event.altKey ? 'Alt' : '', event.shiftKey ? 'Shift' : '', event.key === 'Enter' ? 'Enter' : event.key.toUpperCase()].filter(Boolean).join('+') });
      }
    }}/></label>)}</div>
    <p className="global-shortcuts-help">支持 Control+Shift+字母、Alt+Shift+字母及 Control+Enter。可直接在输入框中按组合键。当前窗口编辑文字或打开对话框时暂停执行。</p>
    <div className="global-shortcuts-actions"><button disabled={!owner || !draft || busy} onClick={save}>保存六项绑定</button><button disabled={!desktop || busy || (!status.enabled && (!owner || !!draft))} onClick={() => void run(async () => {
      if (!desktop) return;
      const result = status.enabled ? await desktop.globalShortcuts({ action: 'disable' }) : await desktop.globalShortcuts({ action: 'enable', seatToken: sessionStorage.getItem('riftcast-seat-token') ?? '', bindings: casterBindings(production) });
      setStatus(result);
      if (result.failures.length) notify(`${result.message}：${result.failures.map(item => item.accelerator).join('、')}`, 'error');
    })}>{status.enabled ? '关闭后台快捷键' : '启用后台快捷键'}</button><span role="status">{status.message}</span></div>
    {!!status.failures.length && <p role="alert" className="global-shortcuts-notice">{status.failures.map(item => `${item.accelerator}：${item.reason}`).join('；')}</p>}
    {!owner && <p className="global-shortcuts-help">取得当前主导播控制权后可修改和启用。</p>}
  </section><CasterControls state={state} seat={seat} connected={connected} send={send} notify={notify}/></>;
}
