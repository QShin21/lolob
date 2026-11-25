import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Scene } from '../../shared/types';
import { defaultTransitionSettings, transitionEvents, type TransitionConfig, type TransitionReceipt, type TransitionSettings } from '../../shared/broadcast-transitions';
import './task-panels.css';
import './transition-controls.css';

const labels: Record<string, string> = { GameEnd: '对局结束', FirstBlood: '第一滴血', Ace: '团灭', Multikill: '连续击杀', BaronKill: '纳什男爵', DragonKill: '巨龙', HeraldKill: '峡谷先锋', InhibKilled: '水晶摧毁', TurretKilled: '防御塔摧毁' };
function Configuration({ value, change, prefix }: { value: TransitionConfig; change: (v: TransitionConfig) => void; prefix: string }) {
  return <div className="transition-config"><label className="field"><span>转场方式</span><select aria-label={`${prefix}方式`} value={value.kind} onChange={e => change({ ...value, kind: e.target.value as TransitionConfig['kind'], ...(e.target.value === 'stinger' ? { pointMs: value.pointMs ?? Math.floor(value.durationMs / 2), stingerPath: value.stingerPath ?? '' } : {}) })}><option value="cut">硬切</option><option value="fade">淡化</option><option value="stinger">视频转场 Stinger</option></select></label>{value.kind !== 'cut' && <label className="field"><span>{value.kind === 'stinger' ? '视频最长播放时长（毫秒）' : '淡化时长（毫秒）'}</span><input className="tpanel-mono" type="number" min={50} max={10000} value={value.durationMs} aria-label={`${prefix}时长`} onChange={e => change({ ...value, durationMs: Number(e.target.value) })}/></label>}{value.kind === 'stinger' && <><label className="field transition-path"><span>本机视频完整路径</span><input aria-label={`${prefix}视频路径`} placeholder="D:\素材\转场.webm" value={value.stingerPath || ''} onChange={e => change({ ...value, stingerPath: e.target.value })}/></label><label className="field"><span>画面切换点（毫秒）</span><input className="tpanel-mono" type="number" min={0} max={value.durationMs - 1} value={value.pointMs ?? 0} aria-label={`${prefix}切换点`} onChange={e => change({ ...value, pointMs: Number(e.target.value) })}/></label></>}</div>;
}
export interface TransitionControlsProps { value?: TransitionSettings; receipt?: TransitionReceipt; scenes: { id: Scene; name: string }[]; onSave: (value: TransitionSettings) => void | Promise<void>; disabled?: boolean }
export function TransitionControls({ value, receipt, scenes, onSave, disabled }: TransitionControlsProps) {
  const [draft, setDraft] = useState(value ?? defaultTransitionSettings()), [message, setMessage] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value ?? defaultTransitionSettings()); }, [value]);
  const updateRule = (id: string, patch: Partial<TransitionSettings['rules'][number]>) => setDraft(s => ({ ...s, rules: s.rules.map(r => r.id === id ? { ...r, ...patch } : r) }));
  return <section className="panel transition-controls tpanel">
    <div className="panel-head"><div className="tpanel-heading"><h2 className="tpanel-title">节目转场</h2><p className="muted tpanel-note">默认方式应用于 TAKE。视频转场使用本机 OBS 可读取的素材，切换点应位于完全遮挡画面的时刻；视频声音保持静音。</p></div></div>
    <fieldset disabled={disabled || saving}>
      <Configuration value={draft.default} change={v => setDraft(s => ({ ...s, default: v }))} prefix="默认转场"/>
      <div className="transition-automatic">
        <label className="transition-enable tpanel-toggle tpanel-toggle-closed"><span>启用事件自动切入</span><input type="checkbox" checked={draft.automatic} onChange={e => setDraft(s => ({ ...s, automatic: e.target.checked }))}/></label>
        <p className="muted tpanel-note">启用后，新采集事件按下列顺序匹配第一条规则并直接切入节目。首次连接和回放跳转跳过旧事件。</p>
        <div className="transition-rules">{draft.rules.map((rule, i) => <article key={rule.id}>
          <header><label><input type="checkbox" checked={rule.enabled} aria-label={`规则 ${i + 1} 启用`} onChange={e => updateRule(rule.id, { enabled: e.target.checked })}/>规则 {i + 1}</label><button className="button small tpanel-remove" type="button" title="删除此规则" onClick={() => setDraft(s => ({ ...s, rules: s.rules.filter(r => r.id !== rule.id) }))}><Trash2 size={15} aria-hidden="true"/><span className="sr-only">删除</span></button></header>
          <div className="transition-config"><label className="field"><span>事件</span><select value={rule.event} aria-label={`规则 ${i + 1} 事件`} onChange={e => updateRule(rule.id, { event: e.target.value as typeof rule.event })}>{transitionEvents.map(event => <option value={event} key={event}>{labels[event]}</option>)}</select></label><label className="field"><span>触发方</span><select value={rule.side} onChange={e => updateRule(rule.id, { side: e.target.value as typeof rule.side })}><option value="any">任意</option><option value="blue">蓝方</option><option value="red">红方</option></select></label><label className="field"><span>切入场景</span><select aria-label={`规则 ${i + 1} 场景`} value={rule.targetScene} onChange={e => updateRule(rule.id, { targetScene: e.target.value as Scene })}>{scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label><label className="field"><span>冷却（秒）</span><input className="tpanel-mono" type="number" min={1} max={300} value={rule.cooldownSeconds} onChange={e => updateRule(rule.id, { cooldownSeconds: Number(e.target.value) })}/></label></div>
          <Configuration value={rule.transition} change={v => updateRule(rule.id, { transition: v })} prefix={`规则 ${i + 1} 转场`}/>
        </article>)}</div>
        {!draft.rules.length && <div className="tpanel-empty"><strong>尚未添加事件规则</strong><p>添加后按列表顺序匹配，第一条命中的规则生效。</p></div>}
      </div>
      <div className="transition-actions"><button className="button" type="button" disabled={!scenes.length || draft.rules.length >= 24} onClick={() => setDraft(s => ({ ...s, rules: [...s.rules, { id: crypto.randomUUID(), enabled: true, event: 'GameEnd', side: 'any', targetScene: scenes.some(v => v.id === 'postgame') ? 'postgame' : scenes[0].id, cooldownSeconds: 10, transition: { ...s.default } }] }))}><Plus size={14} aria-hidden="true"/>添加事件规则</button><button className="button primary" type="button" onClick={() => { setSaving(true); setMessage(''); void Promise.resolve().then(() => onSave(draft)).then(() => setMessage('转场设置已保存'), e => setMessage(e instanceof Error ? e.message : '保存失败')).finally(() => setSaving(false)); }}>保存转场设置</button><small role="status">{message}</small></div>
    </fieldset>
    {receipt && <p className={`transition-receipt ${receipt.status}`} role="status">{receipt.status === 'applied' ? '已完成' : '执行失败'} · {receipt.detail} · {new Date(receipt.endedAt).toLocaleTimeString()}</p>}
  </section>;
}
