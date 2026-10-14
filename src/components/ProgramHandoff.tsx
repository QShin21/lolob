import { useId } from 'react';
import { ArrowRight, ListChecks } from 'lucide-react';
import type { StateContext } from '../../shared/types';
import { applicationLabel, pendingContent } from '../../shared/presentation';
import { sceneDetails } from '../lib';
import { TakeControl } from './ConsoleUI';

/** This is a handoff between saved preview content and the committed program, never a save action. */
export function ProgramHandoff(ctx: StateContext) {
  const { state } = ctx;
  const pending = pendingContent(state);
  const id = useId();
  const application = state.production?.application;
  const saving = state.production?.persistence?.status;
  return <section className="program-handoff" aria-label="本次切入">
    <div className="handoff-receipt" data-state={application?.status ?? 'none'}>
      <span>节目回执</span>
      <strong>{applicationLabel(state)}</strong>
      <small>节目版本 {state.production?.program?.version ?? '—'}</small>
    </div>
    <div className="handoff-preview">
      <span>下一次切入</span>
      <strong title={sceneDetails(state, state.previewScene).name}>{sceneDetails(state, state.previewScene).name}</strong>
      <button popoverTarget={id} className="handoff-diff"><ListChecks size={13}/>{saving === 'failed' ? '磁盘保存失败' : saving === 'saving' ? '正在保存到磁盘' : pending.length ? `${pending.length} 类待播变化` : '配置一致，可再次切入'}</button>
    </div>
    <ArrowRight className="handoff-arrow" size={18}/>
    <TakeControl {...ctx}/>
    <div id={id} popover="auto" className="broadcast-popover">
      <h3>本次待播内容</h3>
      {pending.length ? <ul>{pending.map(item => <li key={item}>{item}</li>)}</ul> : <p>当前配置与节目一致；再次 TAKE 仍会核验并应用当前预监。</p>}
      <p>这里列出服务端待播内容。本地编辑草稿需要先保存；同局实时数据继续更新。</p>
      <p>TAKE 请求、OBS 应用与人工核对分别确认。外部平台接收需另行核对。</p>
    </div>
  </section>;
}
