import { randomUUID } from 'node:crypto';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import { validateTransition, type TransitionConfig, type TransitionReceipt } from '../shared/broadcast-transitions';

export type TransitionObsCall = <T extends keyof OBSRequestTypes>(request: T, data?: OBSRequestTypes[T]) => Promise<OBSResponseTypes[T]>;
export interface TransitionWork { prepare: () => Promise<string>; publish: () => void | Promise<void> }
interface Runtime { now: () => number; delay: (ms: number) => Promise<void> }
const runtime: Runtime = { now: Date.now, delay: ms => new Promise(resolve => setTimeout(resolve, ms)) };

/** A temporary image bridge also gives same-scene browser updates an observable transition. */
export class ObsTransitions {
  private busy = false;
  constructor(private call: TransitionObsCall, private dataDir: string, private clock: Runtime = runtime) {}
  async run(input: TransitionConfig, work: TransitionWork): Promise<TransitionReceipt> {
    const config = validateTransition(input);
    if (this.busy) throw new Error('上一次转场仍在进行');
    if (config.kind === 'stinger') {
      if (!path.isAbsolute(config.stingerPath!) || !/\.(webm|mov|mp4|mkv)$/i.test(config.stingerPath!)) throw new Error('视频转场需使用本机 WebM、MOV、MP4 或 MKV 文件');
      const file = await stat(config.stingerPath!).catch(() => undefined);
      if (!file?.isFile() || file.size < 1) throw new Error('转场视频文件不可用');
    }
    this.busy = true;
    const id = randomUUID(), startedAt = new Date(this.clock.now()).toISOString(), bridge = `RiftCast 转场 ${id}`, still = `${bridge} 静帧`, media = `${bridge} 视频`;
    const screenshot = path.join(this.dataDir, 'transition-cache', `${id}.png`);
    let previous = '', target = '', published = false, created = false, stillCreated = false, mediaCreated = false;
    let original: OBSResponseTypes['GetCurrentSceneTransition'] | undefined;
    let override: OBSResponseTypes['GetSceneSceneTransitionOverride'] | undefined;
    let cut = '', fade = '', detail = '', status: TransitionReceipt['status'] = 'failed', fadeDuration: number | undefined;
    const setScene = async (name: string) => { await this.call('SetCurrentProgramScene', { sceneName: name }); if ((await this.call('GetCurrentProgramScene')).sceneName !== name) throw new Error('OBS 节目场景确认失败'); };
    const select = async (name: string, duration?: number) => { await this.call('SetCurrentSceneTransition', { transitionName: name }); if (duration !== undefined) await this.call('SetCurrentSceneTransitionDuration', { transitionDuration: duration }); };
    const setOverride = (sceneName: string, value?: OBSResponseTypes['GetSceneSceneTransitionOverride']) => {
      // WebSocket 5.x uses null to erase either override. The generated client
      // types omit null; keep the protocol correction at this request boundary.
      const data = { sceneName, transitionName: value?.transitionName ?? null, transitionDuration: value?.transitionDuration ?? null };
      return this.call('SetSceneSceneTransitionOverride', data as OBSRequestTypes['SetSceneSceneTransitionOverride']);
    };
    try {
      previous = (await this.call('GetCurrentProgramScene')).sceneName;
      if (!previous || previous.startsWith('RiftCast 转场 ')) throw new Error('请先恢复有效节目场景再重试转场');
      original = await this.call('GetCurrentSceneTransition');
      const list = await this.call('GetSceneTransitionList');
      cut = String(list.transitions.find(t => t.transitionKind === 'cut_transition')?.transitionName ?? '');
      fade = String(list.transitions.find(t => t.transitionKind === 'fade_transition')?.transitionName ?? '');
      if (!cut || config.kind === 'fade' && !fade) throw new Error('OBS 中缺少硬切或淡化转场');
      if (config.kind !== 'cut') {
        await mkdir(path.dirname(screenshot), { recursive: true });
        const video = await this.call('GetVideoSettings');
        await this.call('SaveSourceScreenshot', { sourceName: previous, imageFormat: 'png', imageFilePath: screenshot, imageWidth: video.baseWidth, imageHeight: video.baseHeight });
        if (!(await stat(screenshot).catch(() => undefined))?.size) throw new Error('OBS 节目静帧未保存成功');
        await this.call('CreateScene', { sceneName: bridge }); created = true;
        // Nest the real old scene below the still, preserving its audio during preparation.
        const old = await this.call('CreateSceneItem', { sceneName: bridge, sourceName: previous, sceneItemEnabled: true });
        const image = await this.call('CreateInput', { sceneName: bridge, inputName: still, inputKind: 'image_source', inputSettings: { file: screenshot, unload: false }, sceneItemEnabled: true }); stillCreated = true;
        const fit = (sceneItemId: number) => this.call('SetSceneItemTransform', { sceneName: bridge, sceneItemId, sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: video.baseWidth, boundsHeight: video.baseHeight } });
        await fit(image.sceneItemId);
        if (config.kind === 'stinger') {
          const clip = await this.call('CreateInput', { sceneName: bridge, inputName: media, inputKind: 'ffmpeg_source', inputSettings: { is_local_file: true, local_file: config.stingerPath!, looping: false, restart_on_activate: false, close_when_inactive: true, clear_on_media_end: false }, sceneItemEnabled: false }); mediaCreated = true;
          await fit(clip.sceneItemId); await this.call('SetInputMute', { inputName: media, inputMuted: true });
        }
        await select(cut); await this.clock.delay(100); await setScene(bridge);
        target = await work.prepare();
        if (!target || target === bridge) throw new Error('目标场景无效');
        const scenes = await this.call('GetSceneList'); if (!scenes.scenes.some(s => s.sceneName === target)) throw new Error('目标场景不存在');
        override = await this.call('GetSceneSceneTransitionOverride', { sceneName: target });
        await setOverride(target);
        if (config.kind === 'fade') {
          await work.publish(); published = true; await this.clock.delay(150);
          await select(fade); fadeDuration = (await this.call('GetCurrentSceneTransition')).transitionDuration;
          await this.call('SetCurrentSceneTransitionDuration', { transitionDuration: config.durationMs }); await setScene(target);
          await this.clock.delay(config.durationMs);
          const deadline = this.clock.now() + 1500;
          while ((await this.call('GetCurrentSceneTransitionCursor')).transitionCursor !== 1) { if (this.clock.now() >= deadline) throw new Error('OBS 淡化结束确认超时'); await this.clock.delay(40); }
        } else {
          const targetItem = target === previous ? old : await this.call('CreateSceneItem', { sceneName: bridge, sourceName: target, sceneItemEnabled: false });
          await this.call('SetSceneItemIndex', { sceneName: bridge, sceneItemId: targetItem.sceneItemId, sceneItemIndex: 0 });
          const mediaItem = (await this.call('GetSceneItemList', { sceneName: bridge })).sceneItems.find(i => i.sourceName === media);
          if (!mediaItem) throw new Error('转场视频来源未创建');
          await this.call('SetSceneItemEnabled', { sceneName: bridge, sceneItemId: Number(mediaItem.sceneItemId), sceneItemEnabled: true });
          await this.call('TriggerMediaInputAction', { inputName: media, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
          const deadline = this.clock.now() + config.durationMs + 3000;
          for (;;) {
            if (this.clock.now() > deadline) throw new Error('转场视频播放确认超时');
            const playback = await this.call('GetMediaInputStatus', { inputName: media });
            if (playback.mediaState === 'OBS_MEDIA_STATE_ERROR') throw new Error('OBS 无法播放转场视频');
            if (playback.mediaDuration > 0 && config.pointMs! >= playback.mediaDuration) throw new Error('视频切换点超出素材实际时长');
            if (!published && Number.isFinite(playback.mediaCursor) && playback.mediaCursor >= config.pointMs! && playback.mediaState === 'OBS_MEDIA_STATE_PLAYING') {
              await work.publish(); published = true; await this.clock.delay(100);
              if (target !== previous) { await this.call('SetSceneItemEnabled', { sceneName: bridge, sceneItemId: targetItem.sceneItemId, sceneItemEnabled: true }); await this.call('SetSceneItemEnabled', { sceneName: bridge, sceneItemId: old.sceneItemId, sceneItemEnabled: false }); }
              await this.call('SetSceneItemEnabled', { sceneName: bridge, sceneItemId: image.sceneItemId, sceneItemEnabled: false });
            }
            if (playback.mediaState === 'OBS_MEDIA_STATE_ENDED' || playback.mediaDuration > 0 && playback.mediaCursor >= playback.mediaDuration) { if (!published) throw new Error('视频结束前未确认切换点'); break; }
            await this.clock.delay(25);
          }
          await select(cut); await setScene(target);
        }
      } else {
        target = await work.prepare();
        override = await this.call('GetSceneSceneTransitionOverride', { sceneName: target });
        await setOverride(target);
        await select(cut); await work.publish(); published = true; await setScene(target);
      }
      status = 'applied'; detail = 'OBS 转场已完成，节目场景已确认';
    } catch (error) {
      detail = error instanceof Error ? error.message : '转场执行失败';
      if (cut && (published ? target : previous)) { await select(cut).catch(() => {}); await setScene(published ? target : previous).catch(() => {}); }
      detail += published ? '；新节目内容已发布，请核对实际画面' : '；节目内容未发布';
    } finally {
      if (override && target) await setOverride(target, override).catch(() => {});
      if (fadeDuration !== undefined && fadeDuration >= 50) await select(fade, fadeDuration).catch(() => {});
      if (original?.transitionName) { await select(original.transitionName, !original.transitionFixed && original.transitionDuration >= 50 ? original.transitionDuration : undefined).catch(() => {}); }
      const safeToRemove = await this.call('GetCurrentProgramScene').then(v => v.sceneName !== bridge, () => false);
      if (safeToRemove) {
        if (created) await this.call('RemoveScene', { sceneName: bridge }).catch(() => {});
        if (mediaCreated) await this.call('RemoveInput', { inputName: media }).catch(() => {});
        if (stillCreated) await this.call('RemoveInput', { inputName: still }).catch(() => {});
        await unlink(screenshot).catch(() => {});
      }
      this.busy = false;
    }
    return { id, kind: config.kind, status, published, startedAt, endedAt: new Date(this.clock.now()).toISOString(), ...(target ? { targetScene: target } : {}), detail };
  }
}
