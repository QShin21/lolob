import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CompanionAudio } from './companion-audio';
import type { ObsClient } from './obs-client';
import type { VirtualAudioDriver, AudioDriverStatus } from './virtual-audio-driver';
import { audioExtension, ObsMusic } from './obs-music';
import { ObsProduction } from './obs-production';
import { createSeed } from './state';

const tracks = () => ({ '1': false, '2': true, '3': false, '4': false, '5': false, '6': false });
class AudioObs extends EventEmitter {
  requests: { type: string; data: any }[] = [];
  active = false; failStart = false;
  inputs = new Map<string, { monitor: string; tracks: Record<string, boolean>; kind: string; settings: Record<string, unknown> }>();
  add(name: string, monitor = 'OBS_MONITORING_TYPE_NONE', kind = 'ffmpeg_source', settings: Record<string, unknown> = {}) { this.inputs.set(name, { monitor, tracks: tracks(), kind, settings }); }
  async call(type: string, data: any = {}): Promise<any> {
    this.requests.push({ type, data }); const source = this.inputs.get(data.inputName);
    if (type === 'GetInputList') return { inputs: [...this.inputs].map(([inputName, value]) => ({ inputName, inputKind: value.kind })) };
    if (type === 'CallVendorRequest') { if (data.requestType === 'start') this.active = !this.failStart; if (data.requestType === 'stop') this.active = false; return { responseData: { protocol: 1, available: true, active: this.active, sampleRate: 48000 } }; }
    if (type === 'GetInputAudioMonitorType') return { monitorType: source!.monitor };
    if (type === 'GetInputAudioTracks') return { inputAudioTracks: { ...source!.tracks } };
    if (type === 'SetInputAudioMonitorType') { source!.monitor = data.monitorType; return {}; }
    if (type === 'SetInputAudioTracks') { source!.tracks = data.inputAudioTracks; return {}; }
    if (type === 'GetInputSettings') return { inputSettings: { ...source!.settings } };
    if (type === 'SetInputSettings') { source!.settings = { ...source!.settings, ...data.inputSettings }; return {}; }
    if (type === 'CreateInput') { this.add(data.inputName, 'OBS_MONITORING_TYPE_NONE', data.inputKind, data.inputSettings); return { sceneItemId: 1 }; }
    if (type === 'GetSceneList') return { scenes: [{ sceneName: 'RiftCast 节目' }, { sceneName: 'RiftCast 回放' }, { sceneName: 'RiftCast 备用画面' }], currentProgramSceneName: 'RiftCast 节目' };
    if (type === 'GetSceneItemList') return { sceneItems: [] };
    if (type === 'GetMediaInputStatus') return { mediaState: 'OBS_MEDIA_STATE_PAUSED', mediaDuration: 10000 };
    if (type === 'GetInputMute') return { inputMuted: true };
    return {};
  }
}
const deviceStatus = (): AudioDriverStatus => ({ available: true, installed: true, render: { id: 'cable-render', name: 'CABLE Input', interfaceName: 'VB-Audio Virtual Cable', capture: false, cable: true }, capture: { id: 'cable-capture', name: 'CABLE Output', interfaceName: 'VB-Audio Virtual Cable', capture: true, cable: true }, devices: { defaultRender: 'headphones', defaultCapture: 'microphone', endpoints: [
  { id: 'cable-render', name: 'CABLE Input', interfaceName: 'VB-Audio Virtual Cable', capture: false, cable: true },
  { id: 'cable-capture', name: 'CABLE Output', interfaceName: 'VB-Audio Virtual Cable', capture: true, cable: true },
  { id: 'cable-render-16', name: 'CABLE In 16ch', interfaceName: 'VB-Audio Virtual Cable', capture: false, cable: true },
] } });
async function fixture(t: import('node:test').TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'riftcast-audio-test-')); const obs = new AudioObs(); let status = deviceStatus();
  const audio = new CompanionAudio(obs as unknown as ObsClient, { status: async () => status } as VirtualAudioDriver, dir);
  t.after(async () => { const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('riftcast-audio-test-')); await rm(resolved, { recursive: true, force: true }); });
  return { dir, obs, audio, status, replace: (next: AudioDriverStatus) => status = next };
}
test('companion uses final track 1, pins capture defaults and restores independent recording tracks and monitoring', async t => {
  const { obs, audio, dir } = await fixture(t);
  obs.add('RiftCast 桌面音频', 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', 'wasapi_output_capture', { device_id: 'default' });
  obs.add('RiftCast 解说麦克风', 'OBS_MONITORING_TYPE_NONE', 'wasapi_input_capture', { device_id: 'default' });
  obs.add('Private preview', 'OBS_MONITORING_TYPE_MONITOR_ONLY');
  await audio.start(); assert.equal(audio.managing, true);
  assert.equal(obs.inputs.get('RiftCast 桌面音频')!.settings.device_id, 'headphones');
  assert.equal(obs.inputs.get('RiftCast 解说麦克风')!.settings.device_id, 'microphone');
  assert.equal(obs.inputs.get('RiftCast 桌面音频')!.monitor, 'OBS_MONITORING_TYPE_NONE');
  assert.deepEqual(obs.inputs.get('Private preview')!.tracks, Object.fromEntries(Object.keys(tracks()).map(key => [key, false])));
  assert.equal(obs.inputs.get('RiftCast 桌面音频')!.tracks['1'], true);
  assert.equal(obs.inputs.get('RiftCast 桌面音频')!.tracks['2'], true);
  const start = obs.requests.find(r => r.type === 'CallVendorRequest' && r.data.requestType === 'start');
  assert.deepEqual(start!.data.requestData, { renderId: 'cable-render', captureId: 'cable-capture' });
  assert.ok(!obs.requests.some(r => ['SetInputMute', 'SetInputVolume', 'SetInputAudioSyncOffset'].includes(r.type)));
  await audio.stop(); assert.equal(audio.managing, false); assert.equal(obs.active, false);
  assert.deepEqual(obs.inputs.get('RiftCast 桌面音频')!.tracks, tracks());
  assert.equal(obs.inputs.get('Private preview')!.monitor, 'OBS_MONITORING_TYPE_MONITOR_ONLY');
  await assert.rejects(readFile(path.join(dir, 'companion-audio-recovery.json')));
});
test('failed native audio start restores monitoring and tracks without starting a partial mix', async t => {
  const { obs, audio } = await fixture(t); obs.add('RiftCast 音乐', 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'); obs.failStart = true;
  await assert.rejects(audio.start(), /尚未开始接收混音/); assert.equal(audio.managing, false); assert.equal(obs.active, false);
  assert.equal(obs.inputs.get('RiftCast 音乐')!.monitor, 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'); assert.deepEqual(obs.inputs.get('RiftCast 音乐')!.tracks, tracks());
});
test('cable feedback is rejected for defaults and the additional Pack45 16-channel endpoint', async t => {
  const { obs, audio, status } = await fixture(t); obs.add('RiftCast 桌面音频', 'OBS_MONITORING_TYPE_NONE', 'wasapi_output_capture', { device_id: 'cable-render-16' });
  await assert.rejects(audio.start(), /正在采集虚拟混音设备/); assert.ok(!obs.requests.some(r => r.data.requestType === 'start'));
  status.devices.defaultRender = 'cable-render'; await assert.rejects(audio.prepare(), /默认音频设备/);
});
test('new replay or music sources are enrolled during output without changing mute, gain or sync', async t => {
  const { obs, audio } = await fixture(t); await audio.start();
  obs.add('RiftCast 回放片段', 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'); obs.emit('InputCreated', { inputName: 'RiftCast 回放片段' }); await (audio as any).pending;
  assert.equal(obs.inputs.get('RiftCast 回放片段')!.tracks['1'], true); assert.equal(obs.inputs.get('RiftCast 回放片段')!.monitor, 'OBS_MONITORING_TYPE_NONE');
  assert.ok(!obs.requests.some(r => ['SetInputMute', 'SetInputVolume', 'SetInputAudioSyncOffset'].includes(r.type))); await audio.stop();
});
test('persisted route snapshot recovers after a crash and missing sources do not prevent recovery', async t => {
  const { obs, audio, dir } = await fixture(t); obs.add('Existing source');
  await writeFile(path.join(dir, 'companion-audio-recovery.json'), JSON.stringify([{ name: 'Existing source', monitor: 'OBS_MONITORING_TYPE_MONITOR_ONLY', tracks: tracks() }, { name: 'Removed source', monitor: 'OBS_MONITORING_TYPE_NONE', tracks: tracks() }]));
  await audio.recover(); assert.equal(obs.inputs.get('Existing source')!.monitor, 'OBS_MONITORING_TYPE_MONITOR_ONLY'); assert.equal(audio.managing, false);
});
test('native failure and disappearing endpoints are never reported as healthy output', async t => {
  const { audio, obs, replace } = await fixture(t); await audio.start(); obs.active = false;
  assert.equal((await audio.status(true)).ready, false);
  replace({ ...deviceStatus(), installed: false }); assert.equal((await audio.status(true)).ready, false);
  await assert.rejects(audio.start(), /送出已中断/); await audio.stop();
  const call = obs.call.bind(obs); obs.call = (type, data) => type === 'CallVendorRequest' ? Promise.resolve({ responseData: { active: true } }) : call(type, data);
  const status = await audio.status(true); assert.equal(status.available, false); assert.equal(status.active, false); assert.equal(status.ready, false);
});
test('production cannot alter bridge-owned monitoring or recording tracks while audio is live', async t => {
  const { obs } = await fixture(t), state = createSeed();
  const production = new ObsProduction(obs as unknown as ObsClient, () => state, work => work(state), () => true);
  await assert.rejects(production.control({ action: 'audio', name: 'RiftCast 音乐', db: -5, monitor: 'OBS_MONITORING_TYPE_MONITOR_ONLY' }), /自动管理/);
  await assert.rejects(production.control({ action: 'tracks' }), /先停止伴侣/);
  assert.equal(obs.requests.length, 0, 'Invalid monitoring mutation cannot partially change volume');
});
function wave() { const bytes = Buffer.alloc(100); bytes.write('RIFF'); bytes.write('WAVE', 8); return bytes; }
test('music import validates signatures, persists an owned file and starts paused at a safe default gain', async t => {
  const { obs, dir } = await fixture(t); const music = new ObsMusic(obs as unknown as ObsClient, dir);
  await music.import(wave(), '../../session.wav');
  const settings = obs.inputs.get('RiftCast 音乐')!.settings;
  assert.ok(String(settings.local_file).startsWith(path.join(dir, 'music') + path.sep));
  assert.equal(settings.looping, true); assert.equal(settings.restart_on_activate, false);
  assert.equal((await music.status()).name, 'session.wav');
  assert.ok(obs.requests.some(r => r.type === 'SetInputVolume' && r.data.inputVolumeDb === -18));
  assert.ok(obs.requests.some(r => r.type === 'TriggerMediaInputAction' && r.data.mediaAction.endsWith('_PAUSE')));
  assert.ok(obs.requests.some(r => r.type === 'CreateSceneItem' && r.data.sceneName === 'RiftCast 回放'));
  await music.control('play'); assert.ok(obs.requests.some(r => r.type === 'SetInputMute' && r.data.inputMuted === false));
  await music.control('stop'); assert.ok(obs.requests.some(r => r.type === 'TriggerMediaInputAction' && r.data.mediaAction.endsWith('_STOP')));
  const restored = new ObsMusic(obs as unknown as ObsClient, dir); await restored.restore(); assert.equal((await restored.status()).available, true);
});
test('invalid music extension, renamed image, oversize data and unsafe persisted paths are rejected', async t => {
  assert.throws(() => audioExtension(wave(), 'image.png')); assert.throws(() => audioExtension(Buffer.alloc(100), 'sound.mp3')); assert.throws(() => audioExtension(Buffer.alloc(33 * 1024 * 1024), 'sound.wav'));
  const { obs, dir } = await fixture(t); await mkdir(path.join(dir, 'music')); await writeFile(path.join(dir, 'music', 'selected.json'), JSON.stringify({ name: 'unsafe', file: '../../file.wav' }));
  const music = new ObsMusic(obs as unknown as ObsClient, dir); await music.restore(); assert.equal((await music.status()).available, false); assert.equal(obs.requests.length, 0);
});
