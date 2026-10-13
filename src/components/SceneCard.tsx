import { Layers, Monitor } from 'lucide-react';
import { sceneLabel } from '../../shared/presentation';
import type { BroadcastState, Champion, Scene } from '../../shared/types';
import { sceneDetails } from '../lib';
export function SceneCard({ state, scene, onSelect }: { state: BroadcastState; sampledState: BroadcastState; champions: Champion[]; scene: Scene; onSelect: (scene: Scene) => void }) {
  const info = sceneDetails(state, scene), custom = state.customScenes?.find(s => s.id === scene);
  const label = sceneLabel(state, scene, info.name);
  const missing = custom?.sources.some(s => s.kind === 'image' && !state.assets.some(a => a.id === s.assetId));
  return <button type="button" className="scene-card scene-bank-entry" aria-label={`${label} · 选择预监${state.programScene === scene ? ' · 当前节目' : ''}`} aria-pressed={state.previewScene === scene} data-program={state.programScene === scene} title={`${label} · ${info.description}`} onClick={() => onSelect(scene)}>
    <span className="scene-bank-symbol">{info.shortcut ? <kbd>{info.shortcut}</kbd> : <Layers size={17}/>}</span>
    <span className="scene-bank-copy"><strong>{label}</strong><small>{custom ? `${custom.sources.length} 图层 · ${missing ? '图片待修复' : '来源在 TAKE 前核验'}` : info.description}</small></span>
    <span className="scene-bank-buses">{state.programScene === scene && <b className="bus-tag pgm">PGM</b>}{state.previewScene === scene && <b className="bus-tag pvw">PVW</b>}</span>
  </button>;
}
