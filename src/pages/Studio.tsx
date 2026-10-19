import { useState } from 'react';
import { FileSliders, Swords } from 'lucide-react';
import type { Phase, Scene, StateContext } from '../../shared/types';
import { GameTime } from '../components/GameTime';
import { MonitorPane } from '../components/MonitorPane';
import { ProductionDesk } from '../components/ProductionDesk';
import { ProgramHandoff } from '../components/ProgramHandoff';
import { SceneLibrary } from '../components/SceneLibrary';
import { StudioDetails } from '../components/StudioDetails';
const phases: Record<Phase, string> = { pregame: '赛前', draft: 'BP', live: '局内', postgame: '赛后' };

export function Studio(ctx: StateContext & { onSettings: () => void; onDraft: () => void; onRecords: () => void }) {
  const { state, send, onSettings, onDraft, onRecords } = ctx;
  const [details, setDetails] = useState(false);
  const canDirect = !!ctx.seat && ctx.seat.role === 'director' && ctx.connected !== false && state.production?.control?.owner === ctx.seat.id;
  const selectScene = (scene: Scene) => { void send({ type: 'preview-scene', scene }).catch(() => {}); };
  return <div className="director-workspace">
    <header className="director-toolbar">
      <h1>导播台</h1>
      <div className="director-phases" aria-label="比赛阶段">{Object.entries(phases).map(([phase, label]) => <button key={phase} disabled={!canDirect} aria-pressed={state.phase === phase} onClick={() => void send({ type: 'set-phase', phase: phase as Phase }).catch(() => {})}>{label}</button>)}</div>
      <span className="director-clock"><GameTime state={state}/></span>
      <div className="director-toolbar-actions"><button className="button small" onClick={onDraft}><Swords size={15}/>BP 与归属</button><button className="button small" onClick={() => setDetails(true)}><FileSliders size={15}/>本局资料</button></div>
    </header>
    <section className="director-vision" aria-label="节目、预监与快捷切入">
      <div className="director-monitors"><MonitorPane {...ctx} kind="program" purpose="program"/><MonitorPane {...ctx} kind="preview" purpose={state.production?.dynamicPreview ? 'dynamic' : 'monitor'}/></div>
      <ProgramHandoff {...ctx}/>
      <SceneLibrary {...ctx} sampledState={state} onSelect={selectScene}/>
    </section>
    <aside className="director-tasks" aria-label="临场工作区"><ProductionDesk {...ctx}/></aside>
    {details && <StudioDetails {...ctx} onClose={() => setDetails(false)} onSettings={() => { setDetails(false); onSettings(); }} onDraft={() => { setDetails(false); onDraft(); }} onRecords={() => { setDetails(false); onRecords(); }}/>}
  </div>;
}
