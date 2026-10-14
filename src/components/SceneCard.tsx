import { Layers, Monitor } from 'lucide-react';
import { sceneLabel } from '../../shared/presentation';
import type { BroadcastState, Champion, Scene, ControlSeat } from '../../shared/types';
import { sceneDetails } from '../lib';
import { customSceneFacts } from './custom-scene-status';
export function SceneCard({ state, scene, onSelect, connected, seat }: { state: BroadcastState; sampledState: BroadcastState; champions: Champion[]; scene: Scene; onSelect: (scene: Scene) => void; connected?: boolean; seat?: ControlSeat }) {
  const info = sceneDetails(state, scene), custom = state.customScenes?.find(s => s.id === scene);
  const label = sceneLabel(state, scene, info.name);
  const facts = custom && customSceneFacts(custom, state);
  return <button type="button" disabled={connected === false || !seat || !['director', 'data'].includes(seat.role)} className="scene-card scene-bank-entry" aria-label={`${label} · 选择预监${state.programScene === scene ? ' · 当前节目' : ''}`} aria-pressed={state.previewScene === scene} data-program={state.programScene === scene} title={`${label} · ${info.description}`} onClick={() => onSelect(scene)}>
    <span className="scene-bank-symbol">{info.shortcut ? <kbd>{info.shortcut}</kbd> : <Layers size={17}/>}</span>
    <span className="scene-bank-copy"><strong>{label}</strong><small>{custom && facts ? `${facts.visible} 可见图层 · ${facts.missingImages.length ? '图片待修复' : facts.changedOnAir ? '新构图待切入' : facts.sharedInputs ? '含共享 OBS 输入' : '来源在 TAKE 前核验'}` : info.description}</small></span>
    <span className="scene-bank-buses">{state.programScene === scene && <b className="bus-tag pgm">PGM</b>}{state.previewScene === scene && <b className="bus-tag pvw">PVW</b>}</span>
  </button>;
}
