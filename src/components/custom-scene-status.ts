import type { BroadcastState, CustomScene } from '../../shared/types';

/** Configuration facts only. Enumerating or resolving an input is not a capture receipt. */
export function customSceneFacts(scene: CustomScene, state: BroadcastState) {
  const visible = scene.sources.filter(source => source.visible);
  const missingImages = visible.filter(source => source.kind === 'image' && !state.assets.some(asset => asset.id === source.assetId));
  const windows = visible.filter(source => source.kind === 'window').length;
  const sharedInputs = visible.filter(source => source.kind === 'obs').length;
  const references = state.production?.rundown.filter(item => item.scene === scene.id) ?? [];
  const snapshot = state.production?.program?.customScenes?.find(item => item.id === scene.id);
  const onAir = state.programScene === scene.id;
  return {
    visible: visible.length, hidden: scene.sources.length - visible.length,
    images: visible.filter(source => source.kind === 'image').length, windows, sharedInputs, missingImages, references, onAir,
    changedOnAir: onAir && !!snapshot && JSON.stringify(scene) !== JSON.stringify(snapshot),
    deleteReason: onAir ? '此场景正在节目中，请先明确切入其他场景。' : references.length ? `串联单仍有 ${references.length} 项引用，请先在播单解除引用。` : '',
  };
}
