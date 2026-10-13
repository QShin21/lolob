import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ObsClient } from './obs-client';
import { VirtualAudioDriver } from './virtual-audio-driver';
import type { CompanionAudioStatus } from '../shared/obs-output';
import { ValidationError } from './state';

type Snapshot = { name: string; monitor: string; tracks: Record<string, boolean> };
export const programAudioNames = ['RiftCast 桌面音频', 'RiftCast 解说麦克风', 'RiftCast 采访', 'RiftCast 音乐', 'RiftCast 回放片段'];
/** One final program mix; no per-source monitoring is used as a mixing bus. */
export class CompanionAudio {
  private snapshots: Snapshot[] = [];
  private active = false;
  private vendorAvailable = false;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private obs: ObsClient, readonly driver: VirtualAudioDriver, private dataDir: string) {
    obs.on('InputCreated', () => { if (this.active) this.pending = this.pending.catch(() => {}).then(() => this.prepareInputs()).catch(() => { /* Report through the next status/start check. */ }); });
    obs.on('ConnectionClosed', () => { this.vendorAvailable = false; });
  }
  get managing() { return this.active; }
  private get recoveryFile() { return path.join(this.dataDir, 'companion-audio-recovery.json'); }
  private async call(action: 'status' | 'start' | 'stop', data: Record<string, string> = {}) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([this.obs.call('CallVendorRequest', { vendorName: 'riftcast-audio', requestType: action, requestData: data }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error()), 8000); })]);
      const response = result.responseData as Record<string, unknown>;
      if (response.protocol !== 1 || response.available !== true || typeof response.active !== 'boolean') throw new Error();
      this.vendorAvailable = true; return response;
    } catch { this.vendorAvailable = false; throw new Error('节目音频组件尚未加载，请在停播窗口重启内置引擎'); }
    finally { if (timer) clearTimeout(timer); }
  }
  async status(connected: boolean): Promise<CompanionAudioStatus> {
    const device = await this.driver.status();
    const status: CompanionAudioStatus = { supported: true, available: false, installed: device.installed, ready: false, active: false, render: device.render, capture: device.capture, needsRestart: device.needsRestart, sampleRate: 48000, channels: 2, track: 1, error: device.error };
    status.managing = this.active;
    if (!connected) return status;
    try {
      const live = await this.call('status');
      status.available = this.vendorAvailable; status.ready = device.installed && this.vendorAvailable;
      status.active = live.active === true;
      for (const key of ['peakDb', 'signalAgeMs', 'receivedFrames', 'renderedFrames', 'droppedFrames', 'underruns'] as const) if (typeof live[key] === 'number' && Number.isFinite(live[key])) status[key] = live[key] as number;
      if (typeof live.error === 'string' && live.error) status.error = '节目混音送出失败，请检查虚拟音频设备并重新准备';
      // A device disappearing while the worker is running is never reported ready.
      if (this.active && (!status.active || !device.installed)) status.ready = false;
    } catch (error) { status.error = error instanceof Error ? error.message : '节目音频状态读取失败'; }
    return status;
  }
  async recover() {
    try {
      const saved = JSON.parse(await readFile(this.recoveryFile, 'utf8'));
      if (Array.isArray(saved) && saved.every(v => typeof v.name === 'string' && typeof v.monitor === 'string' && v.tracks && typeof v.tracks === 'object')) this.snapshots = saved;
    } catch {}
    if (this.snapshots.length) { await this.call('stop'); await this.restore(); }
    this.active = false;
  }
  async prepare() {
    const device = await this.driver.status(true);
    if (!device.installed || !device.render || !device.capture) throw new ValidationError(device.error || '请先自动安装 VB-CABLE，随后重启 Windows 并刷新音频设备');
    await this.call('status');
    if (device.devices.endpoints.some(ep => ep.cable && [device.devices.defaultRender, device.devices.defaultCapture].includes(ep.id))) throw new ValidationError('VB-CABLE 已成为 Windows 默认音频设备。请将默认扬声器和麦克风切回原设备后重新准备，避免重复采集');
    const { inputs } = await this.obs.call('GetInputList');
    for (const input of inputs) {
      if (!['wasapi_output_capture', 'wasapi_input_capture'].includes(String(input.inputKind))) continue;
      const name = String(input.inputName), value = await this.obs.call('GetInputSettings', { inputName: name });
      const selected = value.inputSettings.device_id;
      const capture = input.inputKind === 'wasapi_input_capture';
      const endpoint = selected === 'default' ? capture ? device.devices.defaultCapture : device.devices.defaultRender : selected;
      if (device.devices.endpoints.some(ep => ep.cable && ep.id === endpoint)) throw new ValidationError(name + ' 正在采集虚拟混音设备，请选择原游戏输出或真实麦克风');
      // Pin only OB-managed default sources, so a later Windows default change
      // cannot silently feed the bridge back into its own input.
      if (programAudioNames.includes(name) && selected === 'default' && typeof endpoint === 'string' && endpoint) await this.obs.call('SetInputSettings', { inputName: name, inputSettings: { device_id: endpoint }, overlay: true });
    }
    return device;
  }
  private async prepareInputs() {
    const { inputs } = await this.obs.call('GetInputList');
    for (const input of inputs) {
      const name = String(input.inputName);
      if (this.snapshots.some(item => item.name === name)) continue;
      let monitor: string, tracks: Record<string, boolean>;
      try {
        const result = await Promise.all([this.obs.call('GetInputAudioMonitorType', { inputName: name }), this.obs.call('GetInputAudioTracks', { inputName: name })]);
        monitor = result[0].monitorType; tracks = Object.fromEntries(Object.entries(result[1].inputAudioTracks).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
        if (!monitor || !tracks || typeof tracks['1'] !== 'boolean') continue; // Visual-only input.
      } catch { continue; }
      if (monitor === 'OBS_MONITORING_TYPE_NONE' && (!programAudioNames.includes(name) || tracks['1'])) continue;
      this.snapshots.push({ name, monitor, tracks });
      await writeFile(this.recoveryFile, JSON.stringify(this.snapshots), 'utf8');
      // Monitor-only inputs must remain excluded from all broadcast/recording
      // tracks when their monitoring is temporarily disabled.
      const next = monitor === 'OBS_MONITORING_TYPE_MONITOR_ONLY' ? Object.fromEntries(Object.keys(tracks).map(key => [key, false])) : { ...tracks, ...(programAudioNames.includes(name) ? { '1': true } : {}) };
      await this.obs.call('SetInputAudioTracks', { inputName: name, inputAudioTracks: next });
      if (monitor !== 'OBS_MONITORING_TYPE_NONE') await this.obs.call('SetInputAudioMonitorType', { inputName: name, monitorType: 'OBS_MONITORING_TYPE_NONE' });
    }
  }
  async start() {
    if (this.active) { const live = await this.call('status'); if (live.active === true) return; throw new Error('节目音频送出已中断，请停止伴侣输出后重新启动'); }
    const device = await this.prepare();
    try {
      this.active = true;
      await this.prepareInputs();
      const live = await this.call('start', { renderId: device.render!.id, captureId: device.capture!.id });
      if (live.active !== true) throw new Error('虚拟音频设备尚未开始接收混音，请重启 Windows 后重新准备');
    } catch (error) { await this.stop().catch(() => {}); throw error; }
  }
  private async restore() {
    const remaining: Snapshot[] = [];
    const { inputs } = await this.obs.call('GetInputList');
    for (const item of this.snapshots) {
      if (!inputs.some(v => v.inputName === item.name)) continue;
      try {
        await this.obs.call('SetInputAudioTracks', { inputName: item.name, inputAudioTracks: item.tracks });
        await this.obs.call('SetInputAudioMonitorType', { inputName: item.name, monitorType: item.monitor });
      } catch { remaining.push(item); }
    }
    this.snapshots = remaining;
    if (remaining.length) { await writeFile(this.recoveryFile, JSON.stringify(remaining)); throw new Error('部分音频监听尚未恢复，请重新连接引擎后重试'); }
    await unlink(this.recoveryFile).catch(() => {});
  }
  async stop() {
    this.active = false; await this.pending.catch(() => {});
    await this.call('stop'); await this.restore();
  }
}
