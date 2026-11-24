import { useId } from 'react';
import { ListChecks } from 'lucide-react';
import type { StateContext } from '../../shared/types';
import { pendingContent, sceneLabel } from '../../shared/presentation';
import { sceneDetails } from '../lib';
import { TakeControl } from './ConsoleUI';

/** The handoff from saved preview content to the committed programme. It lives in the fixed deck,
 *  so the next TAKE and what it will change read the same on every page. It is never a save action. */
export function ProgramHandoff(ctx: StateContext) {
  const { state } = ctx;
  const pending = pendingContent(state);
  const id = useId();
  const p = state.production, saving = p?.persistence?.status, name = sceneDetails(state, state.previewScene).name;
  return <section className="program-handoff" aria-label="本次切入">
    <div className="handoff-preview broadcast-pending">
      <span className="bus-tag pvw">PVW</span>
      <div>
        <strong title={name}>{sceneLabel(state, state.previewScene, name)}</strong>
        <button popoverTarget={id} className="handoff-diff" title={pending.join('、') || '查看本次待播内容'}><ListChecks size={13}/>{saving === 'failed' ? '磁盘保存失败' : saving === 'saving' ? '正在保存到磁盘' : pending.length ? `${pending.length} 类待播变化` : '配置一致，可再次切入'}<i> · v{p?.configVersion}</i></button>
      </div>
    </div>
    <TakeControl {...ctx}/>
    <div id={id} popover="auto" className="broadcast-popover">
      <h3>本次待播内容</h3>
      {pending.length ? <ul>{pending.map(item => <li key={item}>{item}</li>)}</ul> : <p>当前配置与节目一致；再次 TAKE 仍会核验并应用当前预监。</p>}
      <p>这里列出服务端待播内容。本地编辑草稿需要先保存；同局实时数据继续更新。</p>
      <p>TAKE 请求、OBS 应用与人工核对分别确认。外部平台接收需另行核对。</p>
    </div>
  </section>;
}
