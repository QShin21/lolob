import { memo } from 'react';
import type { BroadcastState, Champion, Scene } from '../../shared/types';
import { sceneInfo } from '../lib';
import { BroadcastCanvas } from './BroadcastCanvas';

const SceneGraphic = memo(function SceneGraphic({ state, champions, scene }: { state: BroadcastState; champions: Champion[]; scene: Scene }) {
  return <BroadcastCanvas state={state} champions={champions} scene={scene} />;
});

export function SceneCard({ state, sampledState, champions, scene, onSelect }: { state: BroadcastState; sampledState: BroadcastState; champions: Champion[]; scene: Scene; onSelect: (scene: Scene) => void }) {
  return <button type="button" aria-pressed={state.previewScene === scene} title={sceneInfo[scene].name + ' · ' + sceneInfo[scene].description + ' · 按 ' + sceneInfo[scene].shortcut + ' 选择预监'} className={'scene-card ' + (state.previewScene === scene ? 'preview-selected ' : '') + (state.programScene === scene ? 'program-selected' : '')} onClick={() => onSelect(scene)}><div className="scene-thumbnail"><SceneGraphic state={sampledState} champions={champions} scene={scene} /><kbd>{sceneInfo[scene].shortcut}</kbd>{state.programScene === scene && <span className="scene-live"><i />节目</span>}</div><div className="scene-caption"><strong>{sceneInfo[scene].name}</strong>{state.previewScene === scene && <span className="scene-preview-label">预监</span>}</div></button>;
}
