import {sceneLabel} from '../../shared/presentation';
import { memo, useEffect, useRef, useState } from 'react';
import type { BroadcastState, Champion, Scene } from '../../shared/types';
import { sceneInfo } from '../lib';
import { BroadcastCanvas } from './BroadcastCanvas';

const SceneGraphic = memo(function SceneGraphic({ state, champions, scene }: { state: BroadcastState; champions: Champion[]; scene: Scene }) {
  return <BroadcastCanvas state={state} champions={champions} scene={scene} />;
});

export function SceneCard({ state, sampledState, champions, scene, onSelect }: { state: BroadcastState; sampledState: BroadcastState; champions: Champion[]; scene: Scene; onSelect: (scene: Scene) => void }) {
  const ref=useRef<HTMLButtonElement>(null),[visible,setVisible]=useState(false),[compact,setCompact]=useState(()=>matchMedia('(max-height:850px)').matches);
  useEffect(()=>{const observer=new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??false));if(ref.current)observer.observe(ref.current);const media=matchMedia('(max-height:850px)'),change=()=>setCompact(media.matches);media.addEventListener('change',change);return()=>{observer.disconnect();media.removeEventListener('change',change);};},[]);
  const label=sceneLabel(state,scene,sceneInfo[scene].name);
  return <button ref={ref} type="button" aria-label={`${label} · 选择预监${state.programScene===scene?' · 当前节目':''}`} aria-pressed={state.previewScene === scene} title={sceneInfo[scene].name + ' · ' + sceneInfo[scene].description + ' · 按 ' + sceneInfo[scene].shortcut + ' 选择预监'} className={'scene-card ' + (state.previewScene === scene ? 'preview-selected ' : '') + (state.programScene === scene ? 'program-selected' : '')} onClick={() => onSelect(scene)}><div className="scene-thumbnail" aria-hidden="true">{visible&&!compact&&<SceneGraphic state={sampledState} champions={champions} scene={scene} />}<kbd>{sceneInfo[scene].shortcut}</kbd>{state.programScene === scene && <span className="scene-live"><i />节目</span>}</div><div className="scene-caption"><strong>{label}</strong>{state.previewScene === scene && <span className="scene-preview-label">预监</span>}</div></button>;
}
