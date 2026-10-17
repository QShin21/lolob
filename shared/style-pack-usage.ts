import type { BroadcastState } from './types';
import type { StylePackRef } from './style-packs';
import { BUILTIN_STYLE_REF, sameStyle } from './style-packs';

/** Keep deletion checks identical in the manager and the authoritative service. */
export function stylePackDeleteBlock(state: BroadcastState, ref: StylePackRef): string | undefined {
  if (sameStyle(ref, BUILTIN_STYLE_REF)) return '默认风格用于安全回退，需保留';
  if (sameStyle(ref, state.overlay.stylePack)) return '待播配置正在使用，请先准备其他风格到预监';
  if (sameStyle(ref, state.production?.program?.overlay.stylePack)) return '当前节目正在使用，请先切换节目风格并 TAKE';
  if (state.production?.previousProgram && sameStyle(ref, state.production.previousProgram.content.overlay.stylePack)) return '撤回快照正在使用，请在后续 TAKE 更新快照后删除';
}
