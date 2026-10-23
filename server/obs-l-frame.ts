import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import { lFrameGameTransform } from '../shared/l-frame';

type ObsCall = <T extends keyof OBSRequestTypes>(request: T, data?: OBSRequestTypes[T]) => Promise<OBSResponseTypes[T]>;
/** The service calls this with the respective PVW/PGM snapshot before exposing its frame. */
export class ObsLFrame {
  constructor(private request: ObsCall) {}
  async apply(sceneName: string, enabled: boolean): Promise<{ applied: boolean; detail: string }> {
    if (!['RiftCast 节目', 'RiftCast 预监'].includes(sceneName)) return { applied: false, detail: 'L 形构图使用 RiftCast 内置节目与预监场景' };
    const [video, items] = await Promise.all([this.request('GetVideoSettings'), this.request('GetSceneItemList', { sceneName })]);
    if (![video.baseWidth, video.baseHeight].every(n => Number.isFinite(n) && n > 0)) throw new Error('OBS 画布尺寸不可用');
    const game = items.sceneItems.find(i => i.sourceName === 'RiftCast 游戏画面');
    if (!game) return { applied: false, detail: '当前场景缺少 RiftCast 游戏画面来源' };
    const input = await this.request('GetInputSettings', { inputName: 'RiftCast 游戏画面' });
    if (input.inputKind !== 'game_capture') return { applied: false, detail: '游戏画面来源类型不匹配，请重新配置内置引擎' };
    await this.request('SetSceneItemTransform', { sceneName, sceneItemId: Number(game.sceneItemId), sceneItemTransform: lFrameGameTransform(enabled, video.baseWidth, video.baseHeight) });
    return { applied: true, detail: enabled ? '游戏画面已缩放到 L 形构图区域' : '游戏画面已恢复完整画布' };
  }
}
