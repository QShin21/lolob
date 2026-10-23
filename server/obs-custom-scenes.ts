import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { access } from 'node:fs/promises';
import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import type { BroadcastState, CustomScene, CustomSourceChoices } from '../shared/types';
import { ValidationError } from './state';
import { validateBrowserSourceUrl } from './custom-scenes';

type ObsCall = <T extends keyof OBSRequestTypes>(request: T, data?: OBSRequestTypes[T]) => Promise<OBSResponseTypes[T]>;
const prefix = 'RiftCast 自定义 ';
const audioNames = ['RiftCast 桌面音频', 'RiftCast 解说麦克风', 'RiftCast 音乐', 'RiftCast 采访'];

/** Immutable compositions keep edits and failed preparations off the program bus. */
export class ObsCustomScenes {
  private cache = new Map<string, { signature: string; name: string }>();
  private owned = new Map<string, string[]>();
  constructor(private request: ObsCall, private dataDir: string) {}
  private async call<T extends keyof OBSRequestTypes>(request: T, data?: OBSRequestTypes[T]): Promise<OBSResponseTypes[T]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([this.request(request, data), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('OBS 请求超时')), 8000); })]); }
    catch { throw new Error(`自定义场景操作失败（${request}），请检查 OBS 连接及来源`); }
    finally { if (timer) clearTimeout(timer); }
  }
  reset() { this.cache.clear(); }

  async choices(): Promise<CustomSourceChoices> {
    const { inputs } = await this.call('GetInputList');
    const name = prefix + '窗口列表 ' + randomUUID();
    const inputName = name + ' 来源';
    let created = false;
    try {
      await this.call('CreateScene', { sceneName: name }); created = true;
      await this.call('CreateInput', { sceneName: name, inputName, inputKind: 'window_capture', inputSettings: {}, sceneItemEnabled: false });
      const list = await this.call('GetInputPropertiesListPropertyItems', { inputName, propertyName: 'window' });
      return {
        windows: list.propertyItems.filter(p => p.itemEnabled !== false && typeof p.itemValue === 'string' && p.itemValue).map(p => ({ name: String(p.itemName), value: String(p.itemValue) })),
        inputs: inputs.filter(p => !String(p.inputName).startsWith(prefix) && !['wasapi_input_capture', 'wasapi_output_capture', 'wasapi_process_output_capture', 'pulse_input_capture', 'pulse_output_capture'].includes(String(p.inputKind))).map(p => ({ name: String(p.inputName), kind: String(p.inputKind) })),
      };
    } finally {
      if (created) { await this.call('RemoveInput', { inputName }).catch(() => {}); await this.call('RemoveScene', { sceneName: name }).catch(() => {}); }
    }
  }

  async prepare(scene: CustomScene, state: BroadcastState, bus: 'preview' | 'program'): Promise<string> {
    const video = await this.call('GetVideoSettings');
    const signature = JSON.stringify([scene, video.baseWidth, video.baseHeight]);
    const cached = this.cache.get(bus);
    if (cached?.signature === signature) {
      // Recheck referenced resources before TAKE, including windows that may have closed.
      if (bus === 'program') await this.validateSources(scene, state);
      return cached.name;
    }
    await this.validateSources(scene, state);
    const name = prefix + bus + ' ' + randomUUID();
    const ownedInputs: string[] = [];
    await this.call('CreateScene', { sceneName: name });
    this.owned.set(name, ownedInputs);
    try {
      const create = async (inputKind: string, settings: Record<string, string | number | boolean>, suffix: string) => {
        const inputName = name + ' ' + suffix;
        const result = await this.call('CreateInput', { sceneName: name, inputName, inputKind, inputSettings: settings, sceneItemEnabled: true });
        ownedInputs.push(inputName); return result.sceneItemId;
      };
      // OBS colors use packed ABGR (opaque alpha).
      const rgb = scene.background.slice(1), color = (0xff000000 | parseInt(rgb.slice(4, 6), 16) << 16 | parseInt(rgb.slice(2, 4), 16) << 8 | parseInt(rgb.slice(0, 2), 16)) >>> 0;
      await create('color_source_v3', { color, width: video.baseWidth, height: video.baseHeight }, '背景');
      const scale = Math.min(video.baseWidth / 1920, video.baseHeight / 1080);
      for (const [index, source] of scene.sources.entries()) {
        if (!source.visible) continue;
        let sceneItemId: number;
        if (source.kind === 'obs') sceneItemId = (await this.call('CreateSceneItem', { sceneName: name, sourceName: source.inputName!, sceneItemEnabled: true })).sceneItemId;
        else if (source.kind === 'browser') { sceneItemId = await create('browser_source', {
          url: validateBrowserSourceUrl(source.url), width: Math.round(source.width), height: Math.round(source.height), fps: 30,
          shutdown: true, restart_when_active: false, reroute_audio: true, css: 'body { background-color: rgba(0,0,0,0); margin: 0; overflow: hidden; }',
        }, String(index)); await this.call('SetInputMute', { inputName: name + ' ' + String(index), inputMuted: true }); }
        else sceneItemId = await create(source.kind === 'image' ? 'image_source' : 'window_capture', source.kind === 'image'
          ? { file: this.assetPath(state, source.assetId!), unload: false }
          : { window: source.window!, priority: 0, cursor: false, client_area: true, method: 0, capture_audio: false }, String(index));
        await this.call('SetSceneItemTransform', { sceneName: name, sceneItemId, sceneItemTransform: {
          positionX: (video.baseWidth - 1920 * scale) / 2 + source.x * scale, positionY: (video.baseHeight - 1080 * scale) / 2 + source.y * scale,
          alignment: 5, rotation: 0, scaleX: 1, scaleY: 1, boundsAlignment: 0,
          boundsType: source.fit === 'cover' ? 'OBS_BOUNDS_SCALE_OUTER' : source.fit === 'stretch' ? 'OBS_BOUNDS_STRETCH' : 'OBS_BOUNDS_SCALE_INNER',
          boundsWidth: source.width * scale, boundsHeight: source.height * scale, cropToBounds: source.fit === 'cover',
          cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
        } });
      }
      // Preserve the existing desk/microphone mix on air; preview adds no audio inputs.
      if (bus === 'program') {
        const { inputs } = await this.call('GetInputList');
        for (const inputName of audioNames) if (inputs.some(i => i.inputName === inputName) && !scene.sources.some(s => s.visible && s.inputName === inputName)) await this.call('CreateSceneItem', { sceneName: name, sourceName: inputName, sceneItemEnabled: true });
      }
      this.cache.set(bus, { signature, name });
      return name;
    } catch (error) { await this.remove(name); throw error; }
  }
  private assetPath(state: BroadcastState, id: string) {
    const asset = state.assets.find(a => a.id === id);
    if (!asset || !/^\/uploads\/[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(asset.url)) throw new ValidationError('图片素材已不可用，请重新选择');
    return path.join(this.dataDir, 'uploads', path.basename(asset.url));
  }
  private async validateSources(scene: CustomScene, state: BroadcastState) {
    const active = scene.sources.filter(s => s.visible);
    for (const source of active.filter(s => s.kind === 'browser')) validateBrowserSourceUrl(source.url);
    for (const source of active.filter(s => s.kind === 'image')) await access(this.assetPath(state, source.assetId!)).catch(() => { throw new ValidationError(`图片文件不可用：${source.name}`); });
    if (active.some(s => s.kind === 'window')) {
      const choices = await this.choices();
      for (const source of active.filter(s => s.kind === 'window')) if (!choices.windows.some(w => w.value === source.window)) throw new ValidationError(`窗口已关闭或不可用：${source.name}，请重新选择`);
    }
    if (active.some(s => s.kind === 'obs')) {
      const { inputs } = await this.call('GetInputList');
      for (const source of active.filter(s => s.kind === 'obs')) if (!inputs.some(i => i.inputName === source.inputName)) throw new ValidationError(`OBS 来源已移除：${source.name}`);
    }
  }
  async cleanup() {
    const list = await this.call('GetSceneList');
    const keep = new Set([list.currentProgramSceneName, list.currentPreviewSceneName, ...[...this.cache.values()].map(c => c.name)]);
    for (const name of this.owned.keys()) if (!keep.has(name)) await this.remove(name);
  }
  private async remove(name: string) {
    // Only inputs created by this instance are removed; borrowed sources remain intact.
    await this.call('RemoveScene', { sceneName: name }).catch(() => {});
    for (const inputName of this.owned.get(name) ?? []) await this.call('RemoveInput', { inputName }).catch(() => {});
    this.owned.delete(name);
  }
}
