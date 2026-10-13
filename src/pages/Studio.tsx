import { useState } from 'react';
import { ArrowRight, FileSliders, Pause, Play, RotateCcw, Swords } from 'lucide-react';
import type { Phase, Scene, StateContext } from '../../shared/types';
import { pendingContent } from '../../shared/presentation';
import { sceneDetails } from '../lib';
import { GameTime } from '../components/GameTime';
import { MonitorPane } from '../components/MonitorPane';
import { TakeControl } from '../components/ConsoleUI';
import { ProductionDesk } from '../components/ProductionDesk';
import { SceneLibrary } from '../components/SceneLibrary';
import { StudioDetails } from '../components/StudioDetails';
const phases: Record<Phase, string> = { pregame: '赛前', draft: 'BP', live: '局内', postgame: '赛后' };
export function Studio(ctx: StateContext & { onSettings: () => void; onDraft: () => void; onRecords: () => void }) {
  const { state, send, onSettings, onDraft, onRecords } = ctx;
  const [details, setDetails] = useState(false);
  const pending = pendingContent(state);
  const selectScene = (scene: Scene) => { void send({ type: 'preview-scene', scene }).catch(() => {}); };
  return <div className="director-workspace">
    <section className="director-vision" aria-label="节目、预监与快捷切入">
      <div className="director-toolbar">
        <div className="director-phases" aria-label="比赛阶段">{Object.entries(phases).map(([phase, label]) => <button key={phase} aria-pressed={state.phase === phase} onClick={() => void send({ type: 'set-phase', phase: phase as Phase }).catch(() => {})}>{label}</button>)}</div>
        <span className="director-clock"><GameTime state={state}/></span>
        {state.mode === 'demo' && <><button className="director-icon" title={state.paused ? '继续演示' : '暂停演示'} aria-label={state.paused ? '继续演示' : '暂停演示'} onClick={() => void send({ type: 'demo-pause', paused: !state.paused }).catch(() => {})}>{state.paused ? <Play size={15}/> : <Pause size={15}/>}</button><button className="director-icon" title="重置演示" aria-label="重置演示" onClick={() => void send({ type: 'demo-reset' }).catch(() => {})}><RotateCcw size={15}/></button></>}
        <button className="button small" onClick={onDraft}><Swords size={15}/>BP 与归属</button>
        <button className="button small" onClick={() => setDetails(true)}><FileSliders size={15}/>本局资料</button>
      </div>
      <div className="director-monitors"><MonitorPane {...ctx} kind="program" purpose="program"/><MonitorPane {...ctx} kind="preview" purpose={state.production?.dynamicPreview ? 'dynamic' : 'monitor'}/></div>
      <section className="director-transition" aria-label="本次切入">
        <div><span>待播 → 节目</span><strong title={sceneDetails(state, state.previewScene).name}>{sceneDetails(state, state.previewScene).name}</strong></div>
        <p title={pending.join('、')}>{pending.length ? `${pending.length} 类已保存待播改动` : '与节目配置一致 · 可再次切入'}<small>核对预监后切入，同局实时数据持续更新</small></p>
        <ArrowRight size={18}/><TakeControl {...ctx}/>
      </section>
      <SceneLibrary {...ctx} sampledState={state} onSelect={selectScene}/>
      <div className="director-footnote"><span>选择场景仅准备 PVW · <kbd>Enter</kbd> 切入</span><button onClick={onSettings}>连接、输出与设备 →</button></div>
    </section>
    <aside className="director-tasks" aria-label="临场工作区"><ProductionDesk {...ctx}/></aside>
    {details && <StudioDetails {...ctx} onClose={() => setDetails(false)} onSettings={() => { setDetails(false); onSettings(); }} onDraft={() => { setDetails(false); onDraft(); }} onRecords={() => { setDetails(false); onRecords(); }}/>}
  </div>;
}
