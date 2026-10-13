import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import type { ObsClient } from './obs-client';
import { engineScene, emergencyScene } from './obs-engine';
import { ValidationError } from './state';

const inputName = 'RiftCast 音乐';
export type MusicStatus = { available: boolean; name?: string; playing: boolean; state?: string; duration?: number };
export function audioExtension(bytes: Buffer, name: string) {
  const extension = path.extname(name).toLowerCase().slice(1);
  const valid = extension === 'wav' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE'
    : extension === 'mp3' ? bytes.toString('ascii', 0, 3) === 'ID3' || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
    : extension === 'ogg' ? bytes.toString('ascii', 0, 4) === 'OggS'
    : extension === 'flac' && bytes.toString('ascii', 0, 4) === 'fLaC';
  if (!valid || bytes.length < 64 || bytes.length > 32 * 1024 * 1024) throw new ValidationError('请选择 32 MB 以内的 MP3、WAV、OGG 或 FLAC 音乐文件');
  return extension;
}
export class ObsMusic {
  private name?: string;
  constructor(private obs: ObsClient, private dataDir: string) {}
  private get file() { return path.join(this.dataDir, 'music', 'selected.json'); }
  async restore() {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (typeof saved.name === 'string' && /^[a-f0-9-]+\.(mp3|wav|ogg|flac)$/.test(saved.file)) {
        const source = path.join(this.dataDir, 'music', saved.file); await access(source);
        await this.configure(source); this.name = saved.name;
      }
    } catch { /* No music or an unavailable old file stays explicitly unavailable. */ }
  }
  async import(bytes: Buffer, originalName: string) {
    const extension = audioExtension(bytes, originalName), name = path.basename(originalName.replaceAll('\\', '/')).slice(0, 100);
    const dir = path.join(this.dataDir, 'music'); await mkdir(dir, { recursive: true });
    const file = randomUUID() + '.' + extension, source = path.join(dir, file);
    await writeFile(source, bytes);
    await this.configure(source);
    await writeFile(this.file, JSON.stringify({ name, file }, null, 2), 'utf8');
    this.name = name; return this.status();
  }
  private async configure(file: string) {
    const { inputs } = await this.obs.call('GetInputList');
    const settings = { is_local_file: true, local_file: file, looping: true, restart_on_activate: false, close_when_inactive: false, clear_on_media_end: false };
    const existing = inputs.find(i => i.inputName === inputName);
    if (existing && existing.inputKind !== 'ffmpeg_source') throw new ValidationError('音乐通道已被其他类型占用，请在停播窗口检查 OBS 来源');
    if (!existing) {
      await this.obs.call('CreateInput', { sceneName: engineScene, inputName, inputKind: 'ffmpeg_source', inputSettings: settings, sceneItemEnabled: true });
      await this.obs.call('SetInputVolume', { inputName, inputVolumeDb: -18 });
    } else {
      await this.obs.call('SetInputMute', { inputName, inputMuted: true });
      await this.obs.call('SetInputSettings', { inputName, inputSettings: settings, overlay: true });
    }
    await this.obs.call('SetInputMute', { inputName, inputMuted: true });
    await this.obs.call('SetInputAudioMonitorType', { inputName, monitorType: 'OBS_MONITORING_TYPE_NONE' });
    const tracks = await this.obs.call('GetInputAudioTracks', { inputName });
    await this.obs.call('SetInputAudioTracks', { inputName, inputAudioTracks: { ...tracks.inputAudioTracks, '1': true } });
    await this.obs.call('TriggerMediaInputAction', { inputName, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' });
    const scenes = await this.obs.call('GetSceneList');
    for (const scene of scenes.scenes) {
      const name = String(scene.sceneName);
      if (![engineScene, emergencyScene, 'RiftCast 回放', scenes.currentProgramSceneName].includes(name)) continue;
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName: name });
      if (!sceneItems.some(item => item.sourceName === inputName)) await this.obs.call('CreateSceneItem', { sceneName: name, sourceName: inputName, sceneItemEnabled: true });
    }
  }
  async control(action: 'play' | 'pause' | 'stop') {
    if (!this.name) throw new ValidationError('请先添加音乐文件');
    if (action === 'play') {
      const media = await this.obs.call('GetMediaInputStatus', { inputName });
      await this.obs.call('TriggerMediaInputAction', { inputName, mediaAction: media.mediaState === 'OBS_MEDIA_STATE_PAUSED' ? 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY' : 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
      await this.obs.call('SetInputMute', { inputName, inputMuted: false });
    } else {
      await this.obs.call('SetInputMute', { inputName, inputMuted: true });
      await this.obs.call('TriggerMediaInputAction', { inputName, mediaAction: action === 'pause' ? 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' : 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP' });
    }
    return this.status();
  }
  async status(): Promise<MusicStatus> {
    if (!this.name) return { available: false, playing: false };
    try {
      const [media, mute] = await Promise.all([this.obs.call('GetMediaInputStatus', { inputName }), this.obs.call('GetInputMute', { inputName })]);
      return { available: true, name: this.name, playing: media.mediaState === 'OBS_MEDIA_STATE_PLAYING' && !mute.inputMuted, state: media.mediaState, duration: media.mediaDuration / 1000 };
    } catch { return { available: false, name: this.name, playing: false }; }
  }
}
