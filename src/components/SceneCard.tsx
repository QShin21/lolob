import { Layers, Monitor } from 'lucide-react';
import { sceneLabel } from '../../shared/presentation';
import type { BroadcastState, Champion, Scene, ControlSeat } from '../../shared/types';
import { sceneDetails } from '../lib';
import { customSceneFacts } from './custom-scene-status';
export const reportPageNames={1:'赛后报告 · 团队总览',2:'赛后报告 · 选手对位',3:'赛后报告 · 伤害对比'} as const;
export function SceneCard({ state, scene, onSelect, connected, seat, reportPage, disabled }: { state: BroadcastState; sampledState: BroadcastState; champions: Champion[]; scene: Scene; onSelect: (scene: Scene) => void; connected?: boolean; seat?: ControlSeat; reportPage?: 1|2|3; disabled?: boolean }) {
  const info = sceneDetails(state, scene), custom = state.customScenes?.find(s => s.id === scene);
  const label = reportPage?reportPageNames[reportPage]:sceneLabel(state, scene, info.name);
  const isProgram=state.programScene===scene&&(!reportPage||(state.production?.program?.overlay.postgamePage??1)===reportPage);
  const isPreview=state.previewScene===scene&&(!reportPage||(state.overlay.postgamePage??1)===reportPage);
  const facts = custom && customSceneFacts(custom, state);
  return <button type="button" disabled={disabled || connected === false || !seat || !['director', 'data'].includes(seat.role)} className="scene-card scene-bank-entry" aria-label={`${label} · 选择预监${isProgram ? ' · 当前节目' : ''}`} aria-pressed={isPreview} data-program={isProgram} title={`${label} · ${info.description}`} onClick={() => onSelect(scene)}>
    <span className="scene-bank-symbol">{reportPage ? <kbd>{reportPage}/3</kbd> : info.shortcut ? <kbd>{info.shortcut}</kbd> : <Layers size={17}/>}</span>
    <span className="scene-bank-copy"><strong>{label}</strong><small>{custom && facts ? `${facts.visible} 可见图层 · ${facts.missingImages.length ? '图片待修复' : facts.changedOnAir ? '新构图待切入' : facts.sharedInputs ? '含共享 OBS 输入' : '来源在 TAKE 前核验'}` : reportPage ? (reportPage===1?'经济 · 资源 · 团队数据':reportPage===2?'英雄原画 · 输出占比 · 承伤占比':'十人对英雄伤害对比') : info.description}</small></span>
    <span className="scene-bank-buses">{isProgram && <b className="bus-tag pgm">PGM</b>}{isPreview && <b className="bus-tag pvw">PVW</b>}</span>
  </button>;
}
