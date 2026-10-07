import { randomUUID } from 'node:crypto';
import { stat, statfs } from 'node:fs/promises';
import type { ObsClient } from './obs-client';
import type { BroadcastState } from '../shared/types';
import { ensureProduction, programState, productionKey, returnToGame } from '../shared/production';
import { engineScene, emergencyScene } from './obs-engine';
import { record, str, ValidationError } from './state';

const replayScene = 'RiftCast 回放', replayInput = 'RiftCast 回放片段', replayLabel = 'RiftCast 回放标识';
const audioNames = ['RiftCast 桌面音频', 'RiftCast 解说麦克风', 'RiftCast 采访', 'RiftCast 音乐', replayInput];
const clamp = (v: unknown, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ValidationError('音频或片段参数超出范围'); return v; };

/** Independent OBS media playback never sends writes to the Riot client. */
export class ObsProduction {
  private meters = new Map<string, { peakDb: number; at: number; lastSignalAt: number }>();
  private recordId?: string;
  private recordKey?: string;
  private recordingStartedAt?: string;
  private preparedClip?: string;
  private liveSceneName?:string;
  private mutedForClip?: { name: string; muted: boolean }[];
  constructor(private obs: ObsClient, private get: () => BroadcastState, private commit: (work: (s: BroadcastState) => void) => void) {
    obs.on('InputVolumeMeters', event => {
      const now = Date.now();
      for (const input of event.inputs) {
        if (typeof input.inputName !== 'string' || !audioNames.includes(input.inputName) || !Array.isArray(input.inputLevelsMul)) continue;
        const values = input.inputLevelsMul.flat().filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
        const peak = Math.max(0, ...values), previous = this.meters.get(input.inputName);
        this.meters.set(input.inputName, { peakDb: peak > 0 ? 20 * Math.log10(peak) : -96, at: now, lastSignalAt: peak > .001 ? now : previous?.lastSignalAt ?? now });
      }
    });
    obs.on('ConnectionClosed', () => this.meters.clear());
  }
  async status() {
    const state = this.get(), inputs = await this.obs.call('GetInputList');
    const audio = await Promise.all(audioNames.map(async name => {
      if (!inputs.inputs.some(i => i.inputName === name)) return { name, available: false };
      try {
        const [volume, mute, monitor, sync] = await Promise.all([this.obs.call('GetInputVolume', { inputName: name }), this.obs.call('GetInputMute', { inputName: name }), this.obs.call('GetInputAudioMonitorType', { inputName: name }), this.obs.call('GetInputAudioSyncOffset', { inputName: name })]);
        const meter = this.meters.get(name);
        return { name, available: true, db: volume.inputVolumeDb, muted: mute.inputMuted, monitor: monitor.monitorType, syncOffset: sync.inputAudioSyncOffset, ...(meter && Date.now() - meter.at < 2000 ? { peakDb: meter.peakDb, silentSeconds: (Date.now() - meter.lastSignalAt) / 1000 } : {}), meterAvailable: !!meter && Date.now() - meter.at < 2000 };
      } catch { return { name, available: false }; }
    }));
    const [recording, directory, buffer, scenes] = await Promise.allSettled([this.obs.call('GetRecordStatus'), this.obs.call('GetRecordDirectory'), this.obs.call('GetReplayBufferStatus'), this.obs.call('GetSceneList')]);
    let disk: { directory?: string; freeBytes?: number; detail: string } = { detail: '录制路径与空间待确认' };
    if (directory.status === 'fulfilled' && directory.value.recordDirectory) {
      try { const info = await statfs(directory.value.recordDirectory); disk = { directory: directory.value.recordDirectory, freeBytes: info.bavail * info.bsize, detail: '已取得本机可用空间' }; }
      catch { disk = { directory: directory.value.recordDirectory, detail: '录制路径不可读，请选择可写磁盘' }; }
    }
    return { audio, disk, recording: recording.status === 'fulfilled' ? recording.value : null, bufferActive: buffer.status === 'fulfilled' ? buffer.value.outputActive : null,
      emergencyAvailable: scenes.status === 'fulfilled' && scenes.value.scenes.some(s => s.sceneName === emergencyScene),
      gameSource: state.connections.live.status === 'connected' ? '数据已连接 · 图像须人工核对' : '等待本局数据和画面', platform: '接收端须人工回看', programVersion: state.production?.program?.version, previewVersion: state.production?.configVersion };
  }
  async control(input: unknown) {
    const c = record(input), action = str(c.action, 40);
    if (action === 'audio') {
      const name = str(c.name, 80); if (!audioNames.includes(name)) throw new ValidationError('音频总线无效');
      if (c.db !== undefined) await this.obs.call('SetInputVolume', { inputName: name, inputVolumeDb: clamp(c.db, -60, 6) });
      if (c.muted !== undefined) { if (typeof c.muted !== 'boolean') throw new ValidationError('静音状态无效'); await this.obs.call('SetInputMute', { inputName: name, inputMuted: c.muted }); }
      if (c.monitor !== undefined) { if (!['OBS_MONITORING_TYPE_NONE', 'OBS_MONITORING_TYPE_MONITOR_ONLY', 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'].includes(String(c.monitor))) throw new ValidationError('监听模式无效'); await this.obs.call('SetInputAudioMonitorType', { inputName: name, monitorType: String(c.monitor) }); }
      if (c.syncOffset !== undefined) await this.obs.call('SetInputAudioSyncOffset', { inputName: name, inputAudioSyncOffset: Math.round(clamp(c.syncOffset, -10000, 10000)) });
      this.commit(s=>{const p=ensureProduction(s);p.audioEpoch=(p.audioEpoch??0)+1;});
    } else if (action === 'tracks') {
      const [recording,stream]=await Promise.all([this.obs.call('GetRecordStatus'),this.obs.call('GetStreamStatus')]);
      if (recording.outputActive || stream.outputActive || stream.outputReconnecting) throw new ValidationError('音轨配置请在停播维护窗口应用');
      await this.obs.call('SetInputAudioTracks', { inputName: audioNames[0], inputAudioTracks: { '1': true, '2': true, '3': false, '4': false, '5': false, '6': false } });
      await this.obs.call('SetInputAudioTracks', { inputName: audioNames[1], inputAudioTracks: { '1': true, '2': false, '3': true, '4': false, '5': false, '6': false } });
      await this.obs.call('SetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'RecTracks', parameterValue: '7' });
      await this.obs.call('SetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'RecQuality', parameterValue: 'Small' });
    } else if (action === 'start-buffer' || action === 'stop-buffer') {
      await this.obs.call(action === 'start-buffer' ? 'StartReplayBuffer' : 'StopReplayBuffer');
      const status = await this.obs.call('GetReplayBufferStatus'); if (status.outputActive !== (action === 'start-buffer')) throw new Error('回放缓冲状态尚未确认');
    } else if (action === 'save-clip') {
      const before = await this.obs.call('GetLastReplayBufferReplay').catch(() => ({ savedReplayPath: '' }));
      await this.obs.call('SaveReplayBuffer');
      let file = '';
      for (let attempt = 0; attempt < 40; attempt++) { const next = await this.obs.call('GetLastReplayBufferReplay'); if (next.savedReplayPath && next.savedReplayPath !== before.savedReplayPath) { file = next.savedReplayPath; break; } await new Promise(r => setTimeout(r, 150)); }
      if (!file) throw new Error('OBS 尚未确认新的回放文件，请检查缓冲和磁盘');
      const info = await stat(file); if (!info.isFile() || info.size < 1024) throw new Error('回放文件写入不完整');
      const state = this.get(), id = randomUUID();
      const onAir = programState(state);
      this.commit(s => ensureProduction(s).clips.unshift({ id, key: productionKey(onAir), title: str(c.title ?? `GAME ${onAir.match.game} · ${Math.floor(onAir.gameTime)}s`, 150), file, savedAt: new Date().toISOString(), gameTime: onAir.gameTime, duration: 0, inPoint: 0, outPoint: 0, status: 'saved', audio: 'original' }));
    } else if (['prepare-clip', 'play-clip', 'edit-clip'].includes(action)) {
      const clip = this.get().production?.clips.find(clip => clip.id === c.id); if (!clip) throw new ValidationError('片段不存在');
      if (clip.key !== productionKey(programState(this.get()))) throw new ValidationError('片段属于其他局或重赛尝试，请核对比赛身份');
      if (this.get().production?.playingClipId) throw new ValidationError('请先回到比赛，再准备或编辑片段');
      if (action === 'edit-clip') {
        if (this.get().production?.playingClipId === clip.id) throw new ValidationError('先回到比赛，再编辑正在播出的片段');
        const start = clamp(c.inPoint, 0, clip.duration), end = clamp(c.outPoint, start + .1, clip.duration);
        if (!['original', 'commentary'].includes(String(c.audio))) throw new ValidationError('回放音频策略无效');
        this.commit(s => { const saved = ensureProduction(s).clips.find(v => v.id === clip.id)!; saved.inPoint = start; saved.outPoint = end; saved.audio = c.audio as typeof saved.audio; });
      } else {
        if (action === 'play-clip' && (this.preparedClip !== clip.id || clip.status === 'saved')) throw new ValidationError('请先预监片段，确认画面、入出点与声音');
        await this.prepareClip(clip.file);
        if (action === 'prepare-clip') {
          // The workbench video player previews this file; the main game preview keeps its own scene.
          await this.obs.call('TriggerMediaInputAction', { inputName: replayInput, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
          let duration = 0;
          for (let i = 0; i < 15 && !duration; i++) { const media = await this.obs.call('GetMediaInputStatus', { inputName: replayInput }); duration = Number.isFinite(media.mediaDuration) ? media.mediaDuration / 1000 : 0; if (!duration) await new Promise(r => setTimeout(r, 150)); }
          if (!(duration > 0)) throw new Error('片段尚未解码，检查视频文件后重新预监');
          await this.obs.call('SetInputMute', { inputName: replayInput, inputMuted: true });
          this.preparedClip = clip.id;
          this.commit(s => { const item = ensureProduction(s).clips.find(v => v.id === clip.id)!; item.duration = duration; item.outPoint ||= duration; item.inPoint ||= Math.max(0, duration - 20); item.status = 'ready'; });
        } else {
          if (!this.mutedForClip) this.mutedForClip = await Promise.all(audioNames.slice(0, 2).map(async name => ({ name, muted: (await this.obs.call('GetInputMute', { inputName: name })).inputMuted })));
          try {
            await this.obs.call('SetInputMute', { inputName: audioNames[0], inputMuted: true });
            await this.obs.call('SetInputMute', { inputName: audioNames[1], inputMuted: clip.audio === 'original' ? true : this.mutedForClip.find(v => v.name === audioNames[1])!.muted });
            await this.obs.call('SetInputMute', { inputName: replayInput, inputMuted: clip.audio === 'commentary' });
            await this.obs.call('TriggerMediaInputAction', { inputName: replayInput, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
            await this.obs.call('SetMediaInputCursor', { inputName: replayInput, mediaCursor: Math.round(clip.inPoint * 1000) });
            this.liveSceneName=(await this.obs.call('GetCurrentProgramScene')).sceneName;
            await this.obs.call('SetCurrentProgramScene', { sceneName: replayScene });
            if ((await this.obs.call('GetCurrentProgramScene')).sceneName !== replayScene) throw new Error('回放切入尚未确认');
          } catch (error) { await this.returnLive().catch(() => {}); throw error; }
          this.commit(s => { ensureProduction(s).playingClipId = clip.id; ensureProduction(s).feedHold = true; });
        }
      }
    } else if (action === 'return-live') {
      const next = structuredClone(this.get()); returnToGame(next);
      await this.returnLive(); this.commit(s => { returnToGame(s); });
    } else if (action === 'emergency') {
      const scenes = await this.obs.call('GetSceneList');
      if (!scenes.scenes.some(s => s.sceneName === emergencyScene)) throw new ValidationError('本地备用画面尚未准备，请在停播窗口重启内置引擎');
      this.liveSceneName=(await this.obs.call('GetCurrentProgramScene')).sceneName;
      await this.obs.call('SetCurrentProgramScene', { sceneName: emergencyScene });
      if ((await this.obs.call('GetCurrentProgramScene')).sceneName !== emergencyScene) throw new Error('备用画面切换尚未确认');
      if(this.mutedForClip)await this.obs.call('SetInputMute',{inputName:replayInput,inputMuted:true});
      this.commit(s => { const p = ensureProduction(s); p.feedHold = true; p.pause = { kind: 'signal', reason: str(c.reason ?? '播出信号故障', 300), actor: '主机导播', at: new Date().toISOString() }; delete p.playingClipId; });
    } else throw new ValidationError('OBS 制作操作无效');
    return this.status();
  }
  private async prepareClip(file: string) {
    const info = await stat(file); if (!info.isFile() || info.size < 1024) throw new ValidationError('片段文件已丢失或未写完');
    const scenes = await this.obs.call('GetSceneList'); if (!scenes.scenes.some(s => s.sceneName === replayScene)) await this.obs.call('CreateScene', { sceneName: replayScene });
    const inputs = await this.obs.call('GetInputList');
    if (!inputs.inputs.some(i => i.inputName === replayInput)) await this.obs.call('CreateInput', { sceneName: replayScene, inputName: replayInput, inputKind: 'ffmpeg_source', inputSettings: { is_local_file: true, local_file: file, looping: false, restart_on_activate: false, close_when_inactive: false, clear_on_media_end: false }, sceneItemEnabled: true });
    else await this.obs.call('SetInputSettings', { inputName: replayInput, inputSettings: { is_local_file: true, local_file: file, looping: false, restart_on_activate: false, close_when_inactive: false }, overlay: true });
    if (!inputs.inputs.some(i => i.inputName === replayLabel)) await this.obs.call('CreateInput', { sceneName: replayScene, inputName: replayLabel, inputKind: 'text_gdiplus_v3', inputSettings: { text: 'REPLAY / 精彩回放', color: 0xFFFFFF, bk_color: 0x10191B, bk_opacity: 100, font: { face: 'Microsoft YaHei', size: 28, style: 'Bold' } }, sceneItemEnabled: true });
    const items = await this.obs.call('GetSceneItemList', { sceneName: replayScene });
    for (const item of items.sceneItems) if (item.sourceName === replayInput) await this.obs.call('SetSceneItemTransform', { sceneName: replayScene, sceneItemId: Number(item.sceneItemId), sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1920, boundsHeight: 1080 } });
    else if (item.sourceName === replayLabel) await this.obs.call('SetSceneItemTransform', { sceneName: replayScene, sceneItemId: Number(item.sceneItemId), sceneItemTransform: { positionX: 32, positionY: 32, alignment: 5 } });
    // Commentary must also be present in the media scene; it is separately muted by policy.
    if (!items.sceneItems.some(i => i.sourceName === audioNames[1])) await this.obs.call('CreateSceneItem', { sceneName: replayScene, sourceName: audioNames[1], sceneItemEnabled: true });
  }
  async returnLive() {
    const scenes=await this.obs.call('GetSceneList'),target=scenes.scenes.some(s=>s.sceneName===engineScene)?engineScene:this.liveSceneName??scenes.currentProgramSceneName;
    if(!target||[replayScene,emergencyScene].includes(target)||!scenes.scenes.some(s=>s.sceneName===target))throw new Error('比赛来源场景待确认，请检查 OBS 场景后重试');
    await this.obs.call('SetCurrentProgramScene', { sceneName: target });
    if((await this.obs.call('GetCurrentProgramScene')).sceneName!==target)throw new Error('当前比赛场景恢复尚未确认');
    if (this.mutedForClip) { for (const value of this.mutedForClip) await this.obs.call('SetInputMute', { inputName: value.name, inputMuted: value.muted }); this.mutedForClip = undefined; }
    if (this.get().production?.playingClipId) await this.obs.call('SetInputMute', { inputName: replayInput, inputMuted: true });
  }
  async tick() {
    const clip = this.get().production?.clips.find(c => c.id === this.get().production?.playingClipId); if (!clip) return;
    const media = await this.obs.call('GetMediaInputStatus', { inputName: replayInput });
    if (['OBS_MEDIA_STATE_ENDED', 'OBS_MEDIA_STATE_ERROR', 'OBS_MEDIA_STATE_STOPPED'].includes(media.mediaState) || media.mediaCursor >= clip.outPoint * 1000) {
      await this.returnLive(); this.commit(s => { const p = ensureProduction(s); delete p.playingClipId; p.clips.find(c => c.id === clip.id)!.status = 'aired'; s.programScene = 'live'; });
    }
  }
  /** One continuous MKV can contain several games; each TAKE creates a file-time segment. */
  async recordingSegment(source=this.get()) {
    if (!this.recordId) return;
    const state = programState(source), key = productionKey(state);
    if (key === this.recordKey) return;
    const status = await this.obs.call('GetRecordStatus'); if (!status.outputActive) return;
    const seconds = status.outputDuration / 1000, now = new Date().toISOString(), id = randomUUID();
    this.commit(s => { const p = ensureProduction(s), old = [...p.videos].reverse().find(v => v.recordingId === this.recordId && v.endVideoSeconds === undefined);
      if (old) { old.endVideoSeconds = seconds; old.endGameTime = source.production?.previousProgram?.content.telemetry.gameTime; }
      p.videos.push({ id, recordingId: this.recordId, seriesId: state.match.seriesId ?? '', game: state.match.game, attempt: state.production?.attempt ?? 1, title: state.match.title, file: '', startedAt: now, startGameTime: state.gameTime, startVideoSeconds: seconds });
    }); this.recordKey = key;
  }
  async recordingChanged(action: string, source: BroadcastState, file?: string) {
    const state = programState(source), p = ensureProduction(source);
    if (action === 'start-record') {
      this.recordId = randomUUID();
      this.recordKey = productionKey(state); this.recordingStartedAt = new Date().toISOString();
      this.commit(s => ensureProduction(s).videos.push({ id: this.recordId!, recordingId: this.recordId!, seriesId: state.match.seriesId ?? '', game: state.match.game, attempt: state.production?.attempt ?? 1, title: state.match.title, file: '', startedAt: this.recordingStartedAt!, startGameTime: state.gameTime, startVideoSeconds: 0 }));
    } else if (action === 'stop-record') {
      const last=[...p.videos].reverse().find(v=>!v.stoppedAt), id = this.recordId ?? last?.recordingId ?? last?.id;
      const info = file ? await stat(file).catch(() => undefined) : undefined;
      this.commit(s => { for (const v of ensureProduction(s).videos.filter(v => v.recordingId === id || v.id === id)) { const active = v.endVideoSeconds === undefined; Object.assign(v, { file: file ?? '', stoppedAt: new Date().toISOString(), ...(active ? { endGameTime: state.gameTime, endVideoSeconds: this.recordingStartedAt ? (Date.now() - Date.parse(this.recordingStartedAt))/1000 : undefined } : {}), bytes: info?.size, verified: !!info?.isFile() && info.size > 1024, detail: info?.size ? '已确认文件与大小 · 可播放性请回看确认' : '文件写入待确认，请核对 OBS 录制路径' }); } });
      this.recordId = undefined; this.recordKey = undefined; this.recordingStartedAt = undefined;
    }
  }
}
