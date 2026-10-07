import { HoldButton } from './ProductionDesk';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Film, Radio, Settings2, Square, Trophy } from 'lucide-react';
import type { BroadcastState, StateContext } from '../../shared/types';
import { api } from '../lib';
import { currentGameResult, gameResultAwaitingTerminalSample } from '../../shared/game-results';
import { MatchLifecycle } from './MatchLifecycle';
import {checkValid} from '../../shared/production';

export type WorkflowPage = 'studio' | 'draft' | 'data' | 'manage' | 'settings' | 'help' | 'wrap';
type EngineOutput = { mode: 'embedded' | 'external'; connected: boolean; streamActive: boolean; recordActive: boolean; error?: string; performance?: { activeFps: number } };

export function WorkflowRail({ state, page, onNavigate }: { state: BroadcastState; page: WorkflowPage; onNavigate: (page: WorkflowPage) => void }) {
  const matchReady = state.schedule.some(match => state.match.seriesId === state.mode + ':schedule:' + match.id);
  const engineReady = state.connections.obs.status === 'connected';
  const result=currentGameResult(state);
  const steps = [
    { page: 'manage' as const, title: '赛事准备', detail: matchReady ? '已载入比赛' : '建赛 · 阵容 · 载入', ready: matchReady },
    { page: 'settings' as const, title: '连接检查', detail: engineReady ? '引擎已连接 · 核对输出' : '游戏 · 声音 · 推流地址', ready: engineReady },
    { page: 'studio' as const, title: '预监切入', detail: '选场景 → Enter 播出', ready: false },
    { page: 'wrap' as const, title: '局间与收尾', detail: result ? `第 ${result.game} 局已保存 · 下一局` : '自动保存 · 最终报告 · 下一局', ready: !!result },
  ];
  return <nav className="workflow-rail" aria-label="转播流程">{steps.map((step, index) => <button key={step.page} data-workflow-step={step.page} aria-current={page === step.page ? 'step' : undefined} className={page === step.page ? 'current' : step.ready ? 'ready' : ''} onClick={() => onNavigate(step.page)}><span className="workflow-number">{step.ready ? <Check size={12} /> : index + 1}</span><span><strong>{step.title}</strong><small>{step.detail}</small></span>{index < steps.length - 1 && <ArrowRight className="workflow-arrow" size={13} />}</button>)}</nav>;
}

export function StudioOutputDock({ notify, onSettings, streamReady }: Pick<StateContext, 'notify'> & { onSettings: () => void; streamReady: boolean }) {
  const [status, setStatus] = useState<EngineOutput | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const operation = useRef({ generation: 0, pending: false });
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  useEffect(() => {
    let active = true, fetching = false;
    const refresh = async () => {
      if (fetching || document.hidden || operation.current.pending) return;
      const generation = operation.current.generation;
      fetching = true;
      try { const next = await api<EngineOutput>('/api/obs/engine'); if (active && generation === operation.current.generation) { setStatus(next); setError(next.error || ''); } }
      catch { if (active && generation === operation.current.generation) { setStatus(null); setError('输出状态暂不可用'); } }
      finally { fetching = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const canOperate = local && status?.connected && !error && !pending;
  async function output(action: 'start-stream' | 'stop-stream' | 'start-record' | 'stop-record') {
    if (operation.current.pending) return;
    operation.current.pending = true; operation.current.generation++;
    setPending(true);
    try {
      const result = await api<EngineOutput>('/api/obs/engine/output', { method: 'POST', body: JSON.stringify({ action }) });
      setStatus(result); setError(result.error || '');
      const active = action.endsWith('stream') ? result.streamActive : result.recordActive;
      if (active !== action.startsWith('start')) throw new Error('输出状态尚未确认，请在连接与输出核对');
      notify(action === 'start-stream' ? '推流已开始' : action === 'stop-stream' ? '推流已停止' : action === 'start-record' ? '视频录制已开始' : '视频录制已停止');
    } catch (failure) { notify(failure instanceof Error ? failure.message : '输出操作失败','error'); }
    finally { operation.current.pending = false; operation.current.generation++; setPending(false); }
  }
  const confirmed = !!status?.connected && !error;
  return <div className="studio-output-dock" aria-label="播出输出控制"><div className="output-indicators"><span className={confirmed && status?.streamActive ? 'on-air' : ''}><i />{!confirmed ? '推流待确认' : status?.streamActive ? '推流中' : '未推流'}</span><span className={confirmed && status?.recordActive ? 'recording' : ''}><i />{!confirmed ? '录制待确认' : status?.recordActive ? '录制中' : '未录制'}</span>{error && <span className="output-error" title={error}>{error}</span>}</div><div className="output-dock-actions"><button className="button small" disabled={pending} onClick={onSettings}><Settings2 size={13} />连接配置</button>{status?.streamActive?<HoldButton disabled={!canOperate} onExecute={()=>void output('stop-stream')}>按住停止推流</HoldButton>:<button className="button small primary" disabled={streamReady?!canOperate:pending} onClick={()=>streamReady?void output('start-stream'):onSettings()}><Radio size={13}/>{streamReady?'开始推流':'配置推流'}</button>}<button className={'button small ' + (status?.recordActive ? 'output-stop' : '')} disabled={!canOperate} onClick={() => void output(status?.recordActive ? 'stop-record' : 'start-record')}>{status?.recordActive ? <Square size={12} /> : <Film size={13} />}{status?.recordActive ? '停止录制' : '开始录制'}</button></div></div>;
}

export function WrapUp({ state, send, notify, onSettings, onRecords, onManage, onNextGame=onManage, onReport, streamReady }: StateContext & { onSettings: () => void; onRecords: () => void; onManage: () => void; onNextGame?:()=>void;onReport?:()=>void;streamReady: boolean }) {
  const [saving, setSaving] = useState(false);
  const result=currentGameResult(state);
  return <section className="panel wrap-up"><div className="panel-head"><h2><Trophy size={18} />{state.match.title} · 局间与赛后收尾</h2><span className="badge">第 {state.match.game} 局</span></div><div className="wrap-steps">{[{label:'1 · 胜方',ready:!!result?.winner,text:result?.winner?'已确认本局胜方':'等待确认，下一局暂不可用'},{label:'2 · 终局数据',ready:!!result&&!gameResultAwaitingTerminalSample(result),text:result?gameResultAwaitingTerminalSample(result)?'等待终局采样或裁判确认':'数据已冻结':'等待本局结束'},{label:'3 · 报告核对',ready:state.programScene==='postgame'&&checkValid(state,'program'),text:state.programScene==='postgame'&&checkValid(state,'program')?'本版赛后报告已核对':'准备赛后报告并核对本版节目'},{label:'4 · 本局录像',ready:!!state.production?.videos.some(v=>v.seriesId===state.match.seriesId&&v.game===state.match.game&&v.attempt===(state.production?.attempt??1)&&v.verified),text:state.production?.videos.some(v=>v.seriesId===state.match.seriesId&&v.game===state.match.game&&v.attempt===(state.production?.attempt??1)&&v.file)?'文件已索引，检查可播放性':'等待录制文件'},{label:'5 · 下一步',ready:!!result?.seriesComplete,text:result?.seriesComplete?'系列赛结束，核对后停止输出':'局间持续输出，确认后进入下一局'}].map(item=><div className={item.ready?'ready':''} key={item.label}><strong>{item.label}</strong><small>{item.text}</small></div>)}</div><p>客户端确认对局结束后，系统自动保存本局并冻结选手数据与赛后报告。同一场 BO 继续比赛时，点击下一局进入 BP；本场转播结束后分别停止推流和录制。</p><MatchLifecycle {...{state,send,notify,onRecords,onNextGame}} onReport={onReport||onRecords}/><StudioOutputDock notify={notify} onSettings={onSettings} streamReady={streamReady} /><div className="wrap-up-actions">{!result&&<button className="button primary" disabled={saving||!state.players.length||state.gameTime<=0} onClick={async()=>{setSaving(true);try{await send({type:'finalize-game'});notify('已保存末次观测记录，请核对终局补样与胜方');}catch{/* send reports failures */}finally{setSaving(false);}}}>{saving?'正在结算…':'手动结算当前局并冻结数据'}</button>}<button className="button" disabled={saving} onClick={async () => { setSaving(true); try { await send({ type: 'save-recording' }); notify('对局数据快照已保存，可在比赛记录中导出'); onRecords(); } catch { /* send reports failures */ } finally { setSaving(false); } }}>{saving ? '正在保存…' : '另存当前快照'}</button><button className="button" onClick={onManage}>准备下一场比赛<ArrowRight size={15} /></button></div><p className="muted">自动归档保存比分、选手、事件和经济曲线；视频文件由 OBS 录制保存。未确认胜方时保留当前系列赛比分，请先在结算栏确认胜方，再进入下一局。</p></section>;
}
