import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ObsEngine, engineScene, enginePreviewScene } from './obs-engine';
import type { ObsClient } from './obs-client';

const game = 'RiftCast 游戏画面';
const hud = 'RiftCast HUD';
const mic = 'RiftCast 解说麦克风';
const overlayUrl = 'http://127.0.0.1:3888/overlay';
const leagueWindow = 'League of Legends:League of Legends:League of Legends.exe';
class MockObs extends EventEmitter {
  requests: { type: string; data: any }[] = [];
  connections: { url: string; password: string }[] = [];
  disconnections = 0;
  stream = { outputActive: false, outputReconnecting: false };
  recording = { outputActive: false };
  camera = { outputActive: false };
  windows = [{ itemName: 'League of Legends', itemValue: leagueWindow, itemEnabled: true }, { itemName: 'Other Game', itemValue: 'Other:Window:other.exe', itemEnabled: true }];
  inputs: any[] = [];
  sceneItems: any[] = [];
  screenshot = 'data:image/jpeg;base64,aW1hZ2U=';
  encoder = 'x264';
  async connect(url: string, password: string) { this.connections.push({ url, password }); this.emit('Identified'); return {}; }
  async disconnect() { this.disconnections++; this.emit('ConnectionClosed'); }
  async call(type: string, data?: any):Promise<any> {
    this.requests.push({ type, data });
    if (type === 'GetStreamStatus') return this.stream;
    if (type === 'GetRecordStatus') return this.recording;
    if (type === 'GetVirtualCamStatus') return this.camera;
    if (type === 'GetProfileParameter') return { parameterValue: this.encoder, defaultParameterValue: 'x264' };
    if (type === 'GetVideoSettings') return { fpsNumerator: this.encoder === 'x264' ? 30 : 60, fpsDenominator: 1 };
    if (type === 'GetStats') return { activeFps: 60, cpuUsage: 2, averageFrameRenderTime: 1, renderSkippedFrames: 0, renderTotalFrames: 60, outputSkippedFrames: 0, outputTotalFrames: 60 };
    if (type === 'StartStream') { this.stream.outputActive = true; return {}; }
    if (type === 'StopStream') { this.stream.outputActive = false; this.stream.outputReconnecting = false; return {}; }
    if (type === 'StartRecord') { this.recording.outputActive = true; return {}; }
    if (type === 'StopRecord') { this.recording.outputActive = false; return {}; }
    if (type === 'StartVirtualCam') { this.camera.outputActive = true; return {}; }
    if (type === 'StopVirtualCam') { this.camera.outputActive = false; return {}; }
    if (type === 'GetSceneList') return { scenes: [{ sceneName: engineScene }], currentProgramSceneName: engineScene };
    if (type === 'GetCurrentProgramScene') return { sceneName: engineScene };
    if (type === 'GetStudioModeEnabled') return { studioModeEnabled: true };
    if (type === 'GetCurrentPreviewScene') return { sceneName: 'External preview' };
    if (type === 'GetInputList') return { inputs: [...this.inputs] };
    if (type === 'GetSpecialInputs') return { desktop1: 'Renamed global desktop', desktop2: null, mic1: 'Renamed global mic', mic2: null, mic3: null, mic4: null };
    if (type === 'GetSceneItemList') return { sceneItems: [...this.sceneItems] };
    if (type === 'GetInputPropertiesListPropertyItems') return { propertyItems: data.inputName === game ? this.windows : [{ itemName: 'Default', itemValue: 'default', itemEnabled: true }, { itemName: 'Interface', itemValue: 'device-id', itemEnabled: true }] };
    if (type === 'CreateInput') {
      this.inputs.push({ inputName: data.inputName, inputKind: data.inputKind });
      const sceneItemId = this.sceneItems.length + 1;
      this.sceneItems.push({ sourceName: data.inputName, sceneItemId });
      return { sceneItemId, inputUuid: `uuid-${sceneItemId}` };
    }
    if (type === 'CreateSceneItem') { const sceneItemId = this.sceneItems.length + 1; this.sceneItems.push({ sourceName: data.sourceName, sceneItemId }); return { sceneItemId }; }
    if (type === 'GetSourceScreenshot') return { imageData: this.screenshot };
    return {};
  }
}
class FakeChild extends EventEmitter {
  pid = 987654;
  exitCode: number | null = null;
  signalCode: string | null = null;
  kills = 0;
  exit() { this.exitCode = 0; this.emit('exit', 0, null); }
  kill() { this.kills++; this.signalCode = 'SIGTERM'; this.emit('exit', null, 'SIGTERM'); return true; }
}
async function fixture(t: TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'riftcast-engine-test-'));
  const obs = new MockObs();
  const notices: { status: string; detail: string }[] = [];
  const engine = new ObsEngine(obs as unknown as ObsClient, { root: dir, dataDir: path.join(dir, 'data'), overlayUrl, onConnection: (status, detail) => notices.push({ status, detail }) });
  const internal = engine as any;
  engine.mode = 'embedded';
  // All tests use mock transports and mock children. No real OBS process is launched.
  internal.requestProcessClose = async (child: FakeChild) => child.exit();
  internal.preferredEncoder = async () => 'x264';
  internal.cameraDriver = { status: async () => ({ available: true, installed: true }), install: async () => ({ available: true, installed: true }) };
  let audioActive = false;
  internal.companionAudio = { get managing() { return audioActive; }, recover: async () => {}, prepare: async () => {}, start: async () => { audioActive = true; }, stop: async () => { audioActive = false; },
    status: async () => ({ supported: true, available: true, installed: true, ready: true, active: audioActive, sampleRate: 48000, channels: 2, track: 1 }),
    driver: { status: async () => ({ installed: true }), install: async () => ({ installed: true }) } };
  t.after(async () => {
    internal.endWindowRefresh();
    const absolute = path.resolve(dir);
    assert.ok(absolute.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(absolute).startsWith('riftcast-engine-test-'));
    await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  return { dir, obs, engine, internal, notices };
}

test('portable configuration is isolated, authenticated and preserves existing profile settings', async t => {
  const { dir, engine, internal } = await fixture(t);
  internal.version = '32.2.2';
  await internal.prepareConfig(12345, 'unit-test-password');
  const config = path.join(dir, 'runtime', 'obs-studio', 'config', 'obs-studio');
  const user = await readFile(path.join(config, 'user.ini'), 'utf8');
  const global = await readFile(path.join(config, 'global.ini'), 'utf8');
  assert.match(user, /FirstRun=true/);
  assert.match(user, /ConfigOnNewProfile=false/);
  assert.match(user, /SysTrayWhenStarted=true/);
  assert.match(user, /SaveProjectors=false/);
  assert.match(global, /InfoLastVersion=35192962154496/);
  assert.match(user, /ConfirmOnExit=false/);
  assert.match(global, /InfoIncrement=2147483647/);
  const profile = path.join(config, 'basic', 'profiles', 'RiftCast', 'basic.ini');
  await writeFile(profile, '[General]\nName=RiftCast\n[SimpleOutput]\nVBitrate=4321\n', 'utf8');
  await writeFile(path.join(config, 'user.ini'), '[General]\nFirstRun=false\nConfirmOnExit=true\nCustomSetting=keep-me\n[Basic]\nConfigOnNewProfile=true\n', 'utf8');
  await internal.prepareConfig(23456, 'rotated-unit-test-password');
  assert.match(await readFile(profile, 'utf8'), /VBitrate=4321/);
  const repairedUser = await readFile(path.join(config, 'user.ini'), 'utf8');
  assert.match(repairedUser, /FirstRun=true/); assert.match(repairedUser, /ConfirmOnExit=false/); assert.match(repairedUser, /CustomSetting=keep-me/); assert.match(repairedUser, /ConfigOnNewProfile=false/);
  const plugin = JSON.parse(await readFile(path.join(config, 'plugin_config', 'obs-websocket', 'config.json'), 'utf8'));
  assert.deepEqual(plugin, { first_load: false, server_enabled: true, server_port: 23456, alerts_enabled: false, auth_required: true, server_password: 'rotated-unit-test-password' });
  const status = await engine.status();
  assert.ok(!JSON.stringify(status).includes('unit-test-password'));
  assert.ok(!JSON.stringify(status).includes('server_password'));
});

test('spectator OCR captures only the verified original LoL source at native resolution',async t=>{
  const {obs,engine,internal}=await fixture(t);internal.connected=true;internal.selection.gameWindow=leagueWindow;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/K1sAAAAASUVORK5CYII=','base64');
  obs.screenshot=`data:image/png;base64,${png.toString('base64')}`;
  const original=obs.call.bind(obs);let sourceWindow=leagueWindow;
  obs.call=async(type,data)=>type==='GetInputSettings'?{inputKind:'game_capture',inputSettings:{window:sourceWindow}}:original(type,data);
  internal.liveCapture=Promise.reject(new Error('previous preview failed'));internal.liveCapture.catch(()=>{});
  assert.deepEqual(await engine.spectatorFrame(),png);
  const request=obs.requests.find(entry=>entry.type==='GetSourceScreenshot')!;
  assert.deepEqual(request.data,{sourceName:game,imageFormat:'png',imageCompressionQuality:80});
  sourceWindow='Other:Window:other.exe';const count=obs.requests.length;await assert.rejects(engine.spectatorFrame(),/英雄联盟/);assert.equal(obs.requests.length,count,'an unverified input must not be captured');
});

test('automatic scene setup creates exact LoL capture, muted microphone and HUD above game', async t => {
  const { obs, engine, internal, dir } = await fixture(t);
  internal.connected = true;
  await engine.setup({});
  const creation = obs.requests.filter(request => request.type === 'CreateInput');
  assert.equal(creation.length, 4);
  const gameSource = creation.find(request => request.data.inputName === game)!;
  assert.equal(gameSource.data.inputKind, 'game_capture');
  assert.equal(gameSource.data.inputSettings.capture_mode, 'window');
  const gameSettings = obs.requests.filter(request => request.type === 'SetInputSettings' && request.data.inputName === game).at(-1)!;
  assert.equal(gameSettings.data.inputSettings.window, leagueWindow);
  const browser = creation.find(request => request.data.inputName === hud)!;
  assert.equal(browser.data.inputSettings.url, overlayUrl);
  assert.equal(browser.data.inputSettings.width, 1920);
  assert.equal(browser.data.inputSettings.fps_custom, true);
  assert.equal(gameSource.data.inputSettings.limit_framerate, true);
  assert.equal(creation.find(request => request.data.inputName === 'RiftCast 桌面音频')!.data.inputSettings.use_device_timing, false);
  assert.ok(obs.requests.some(request => request.type === 'SetInputMute' && request.data.inputName === mic && request.data.inputMuted));
  assert.ok(obs.requests.some(request => request.type === 'SetInputMute' && request.data.inputName === 'Renamed global desktop' && request.data.inputMuted));
  assert.ok(!obs.requests.some(request => request.type === 'RemoveInput'));
  const indexes = obs.requests.filter(request => request.type === 'SetSceneItemIndex');
  assert.equal(indexes[0].data.sceneItemIndex, 0);
  assert.equal(indexes.at(-1)!.data.sceneItemIndex, 3);
  assert.ok(!obs.requests.some(request => /^(Start|Stop)(Stream|Record)$/.test(request.type)));
  const saved = JSON.parse(await readFile(path.join(dir, 'data', 'obs-engine.json'), 'utf8'));
  assert.equal(saved.selection.gameWindow, leagueWindow);
  obs.requests = [];
  await engine.setup({ micEnabled: true, desktopDevice: 'device-id' });
  assert.ok(!obs.requests.some(request => request.type === 'CreateInput'));
  assert.ok(obs.requests.some(request => request.type === 'SetSceneItemEnabled' && request.data.sceneItemEnabled));
  assert.ok(obs.requests.some(request => request.type === 'SetInputMute' && request.data.inputName === mic && !request.data.inputMuted));
});

test('setup refuses active or unconfirmed outputs and invalid primitive selections before mutation', async t => {
  const { obs, engine, internal } = await fixture(t);
  internal.connected = true;
  for (const flags of [{ outputActive: true, outputReconnecting: false }, { outputActive: false, outputReconnecting: true }, { outputActive: undefined, outputReconnecting: false }]) {
    obs.stream = flags as any;
    await assert.rejects(engine.setup({}));
    assert.ok(obs.requests.every(request => request.type === 'GetStreamStatus' || request.type === 'GetRecordStatus'));
    obs.requests = [];
  }
  obs.stream = { outputActive: false, outputReconnecting: false };
  obs.recording.outputActive = true;
  await assert.rejects(engine.setup({}), /停止推流和录制/);
  obs.requests = [];
  for (const invalid of [{ gameWindow: 123 }, { desktopDevice: '' }, { micEnabled: 'yes' }, { micDevice: 'bad\nvalue' }, { outputFps: 120 }]) await assert.rejects(engine.setup(invalid));
  assert.equal(obs.requests.length, 0);
});

test('source conflicts are rejected and unavailable window values are never applied', async t => {
  const { obs, engine, internal } = await fixture(t);
  internal.connected = true;
  obs.inputs = [{ inputName: game, inputKind: 'browser_source' }];
  await assert.rejects(engine.setup({}), /类型发生变化/);
  assert.ok(!obs.requests.some(request => request.type === 'SetInputSettings'));
  obs.inputs = []; obs.requests = [];
  await assert.rejects(engine.setup({ gameWindow: 'default' }), /已不可用/);
  assert.ok(!obs.requests.some(request => request.type === 'SetInputSettings' && request.data.inputSettings.window === 'default'));
});

test('delayed LoL startup binds only exact enabled executable and preserves a selected window', async t => {
  const { obs, internal } = await fixture(t);
  internal.connected = true;
  obs.windows = [{ itemName: 'Fake League', itemValue: 'Title:Class:notLeague of Legends.exe', itemEnabled: true }];
  await internal.refreshGameWindow();
  assert.equal(obs.requests.filter(request => request.type === 'SetInputSettings').length, 0);
  obs.windows = [{ itemName: 'Disabled', itemValue: leagueWindow, itemEnabled: false }];
  await internal.refreshGameWindow();
  assert.equal(obs.requests.filter(request => request.type === 'SetInputSettings').length, 0);
  obs.windows = [{ itemName: 'Game', itemValue: leagueWindow, itemEnabled: true }];
  await internal.refreshGameWindow();
  assert.equal(internal.selection.gameWindow, leagueWindow);
  const mutations = obs.requests.filter(request => request.type.startsWith('Set'));
  assert.deepEqual(mutations.map(request => request.type), ['SetInputSettings']);
  internal.selection.gameWindow = 'User selected:Class:custom.exe';
  await internal.refreshGameWindow();
  assert.equal(internal.selection.gameWindow, 'User selected:Class:custom.exe');
  assert.equal(obs.requests.filter(request => request.type === 'SetInputSettings').length, 1);
});

test('lost transport reconnects the owned live OBS without restarting or altering active outputs', async t => {
  const { obs, engine, internal } = await fixture(t);
  internal.child = new FakeChild();
  internal.endpoint = { url: 'ws://127.0.0.1:23456', password: 'private-unit-test-password' };
  obs.stream.outputActive = true; obs.recording.outputActive = true;
  const result = await engine.start();
  assert.equal(result.connected, true);
  assert.equal(result.streamActive, true);
  assert.equal(obs.connections.length, 1);
  assert.ok(!obs.requests.some(request => request.type.startsWith('Set') || request.type.startsWith('Stop') || request.type.startsWith('Create')));
  assert.ok(!JSON.stringify(result).includes('private-unit-test-password'));
});

test('failed reconnect retains owned process and sanitizes transport error credentials', async t => {
  const { obs, engine, internal, notices } = await fixture(t);
  const child = new FakeChild(); internal.child = child;
  internal.endpoint = { url: 'ws://127.0.0.1:23456', password: 'private-unit-test-password' };
  obs.connect = async () => { throw new Error('transport leaked private-unit-test-password'); };
  await assert.rejects(engine.start(), /现有输出已保留/);
  assert.equal(internal.child, child);
  assert.equal(child.kills, 0);
  assert.ok(!JSON.stringify(notices).includes('private-unit-test-password'));
});

test('concurrent start requests share one launch and mutations are serialized', async t => {
  const { engine, internal } = await fixture(t);
  let finish!: () => void; let launches = 0;
  internal.launch = async () => { launches++; await new Promise<void>(resolve => { finish = resolve; }); };
  const first = engine.start(); const second = engine.start();
  await assert.rejects(engine.exclusive(async () => {}), /正在处理/);
  finish(); await Promise.all([first, second]);
  assert.equal(launches, 1);
  let release!: () => void;
  const operation = engine.exclusive(async () => new Promise<void>(resolve => { release = resolve; }));
  await assert.rejects(engine.exclusive(async () => {}), /正在处理/);
  release(); await operation;
});

test('shutdown stops only owned outputs and never sends stop commands to external OBS', async t => {
  const { obs, engine, internal } = await fixture(t);
  engine.mode = 'external'; internal.connected = true;
  obs.stream.outputActive = true; obs.recording.outputActive = true;
  await engine.close();
  assert.equal(obs.disconnections, 1);
  assert.equal(obs.requests.length, 0);
  const owned = await fixture(t); const child = new FakeChild();
  owned.internal.child = child; owned.internal.connected = true;
  owned.obs.stream.outputActive = true; owned.obs.recording.outputActive = true;
  await owned.engine.close();
  assert.deepEqual(owned.obs.requests.map(request => request.type), ['GetStreamStatus', 'StopStream', 'GetStreamStatus', 'GetRecordStatus', 'StopRecord', 'GetRecordStatus', 'GetVirtualCamStatus']);
  assert.equal(child.exitCode, 0);
  assert.equal(owned.internal.child, undefined);
  await assert.rejects(owned.engine.output({ action: 'start-record' }));
});

test('mode switch refuses active or disconnected owned outputs and source preview validates data', async t => {
  const { obs, engine, internal } = await fixture(t);
  internal.child = new FakeChild();
  await assert.rejects(engine.setMode({ mode: 'external' }), /连接已断开/);
  internal.connected = true; obs.stream.outputActive = true;
  await assert.rejects(engine.setMode({ mode: 'external' }), /停止推流和录制/);
  assert.equal(engine.mode, 'embedded');
  obs.stream.outputActive = false;
  assert.equal((await engine.preview()).imageData, obs.screenshot);
  internal.previewCache = undefined;
  obs.screenshot = 'https://untrusted.test/image.jpg';
  await assert.rejects(engine.preview(), /无效预览/);
  await engine.setMode({ mode: 'external' });
  assert.equal(engine.mode, 'external');
  assert.equal(internal.child, undefined);
});

test('startup migrates the owned profile to hardware encoding while retaining destination and bitrate', async t => {
  const { dir, internal, obs, engine } = await fixture(t);
  internal.preferredEncoder = async () => 'nvenc';
  await internal.prepareConfig(12345, 'unit-test-password');
  const profile = path.join(dir, 'runtime', 'obs-studio', 'config', 'obs-studio', 'basic', 'profiles', 'RiftCast', 'basic.ini');
  const content = await readFile(profile, 'utf8');
  assert.match(content, /StreamEncoder=nvenc/); assert.match(content, /FPSNum=60/); assert.match(content, /NVENCPreset2=p4/);
  await writeFile(profile, content.replace('VBitrate=6000', 'VBitrate=4321'), 'utf8');
  await internal.prepareConfig(12346, 'rotated-unit-test-password');
  assert.match(await readFile(profile, 'utf8'), /VBitrate=4321/);
  internal.connected = true; obs.encoder = 'nvenc'; await engine.setup({});
  assert.equal(obs.requests.find(request => request.type === 'SetVideoSettings')!.data.fpsNumerator, 60);
  assert.equal(obs.requests.find(request => request.type === 'CreateInput' && request.data.inputName === hud)!.data.inputSettings.fps, 60);
  assert.ok(!obs.requests.some(request => ['SetStreamServiceSettings', 'StartStream', 'StopStream'].includes(request.type)));
  obs.requests = []; await engine.setup({ outputFps: 30 });
  assert.equal(obs.requests.find(request => request.type === 'SetVideoSettings')!.data.fpsNumerator, 30);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'data', 'obs-engine.json'), 'utf8')).selection.outputFps, 30);
});

test('simultaneous previews share one GPU screenshot and output preview has lower overhead', async t => {
  const { internal, obs, engine } = await fixture(t); internal.connected = true;
  internal.outputActive = true;
  const previews = await Promise.all(Array.from({ length: 10 }, () => engine.preview()));
  assert.equal(obs.requests.filter(request => request.type === 'GetSourceScreenshot').length, 1);
  assert.ok(previews.every(preview => preview.imageData === obs.screenshot && preview.nextRefreshMs === 5000));
  assert.equal(obs.requests.find(request => request.type === 'GetSourceScreenshot')!.data.imageWidth, 640);
  await engine.preview(); assert.equal(obs.requests.filter(request => request.type === 'GetSourceScreenshot').length, 1);
  obs.emit('CurrentProgramSceneChanged', { sceneName: 'Next' }); await engine.preview();
  assert.equal(obs.requests.filter(request => request.type === 'GetSourceScreenshot').length, 2);
});

test('missing optional OBS statistics retain connection and output controls', async t => {
  const { internal, obs, engine } = await fixture(t); internal.connected = true;
  const original = obs.call.bind(obs);
  obs.call = async (type, data) => { if (type === 'GetStats') throw new Error('Unsupported request'); return original(type, data); };
  const status = await engine.status();
  assert.equal(status.connected, true); assert.equal(status.performance, undefined);
  assert.ok(!obs.requests.some(request => request.type.startsWith('Set') || request.type.startsWith('Start')));
});

test('saved mode honors explicit environment and external process settings stay outside engine state', async t => {
  const { dir, engine, internal } = await fixture(t);
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await writeFile(path.join(dir, 'data', 'obs-engine.json'), JSON.stringify({ mode: 'external', selection: { gameWindow: 'selected-window', micEnabled: true }, password: 'ignored-unit-test-password' }), 'utf8');
  const original = process.env.RIFTCAST_OBS_MODE;
  process.env.RIFTCAST_OBS_MODE = 'embedded';
  try { await engine.initialize(); } finally { if (original === undefined) delete process.env.RIFTCAST_OBS_MODE; else process.env.RIFTCAST_OBS_MODE = original; }
  assert.equal(engine.mode, 'embedded');
  assert.equal(internal.selection.gameWindow, 'selected-window');
  assert.ok(!JSON.stringify(await engine.status()).includes('ignored-unit-test-password'));
});

test('output commands wait for asynchronous recording start and final stop states', async t => {
  const { obs, engine, internal } = await fixture(t);
  internal.connected = true;
  const original = obs.call.bind(obs);
  let pending: boolean | undefined; let polls = 0;
  obs.call = async (type, data) => {
    if (type === 'StartRecord' || type === 'StopRecord') { obs.requests.push({ type, data }); pending = type === 'StartRecord'; polls = 0; return {}; }
    if (type === 'GetRecordStatus' && pending !== undefined) { polls++; if (polls >= 3) { obs.recording.outputActive = pending; pending = undefined; } }
    return original(type, data);
  };
  const started = await engine.output({ action: 'start-record' });
  assert.equal(started.recordActive, true);
  assert.ok(polls >= 3);
  const stopped = await engine.output({ action: 'stop-record' });
  assert.equal(stopped.recordActive, false);
  assert.ok(polls >= 3);
  assert.ok(!obs.requests.some(request => request.type === 'StartStream'));
});

test('OBS readiness waits for a loaded collection after transport identification', async t => {
  const { obs, internal } = await fixture(t);
  const original = obs.call.bind(obs); let attempts = 0;
  obs.call = async (type, data) => { if (type === 'GetSceneList' && ++attempts < 3) { obs.requests.push({ type, data }); return { scenes: [], currentProgramSceneName: '' }; } return original(type, data); };
  await internal.waitReady(new FakeChild());
  assert.equal(attempts, 3);
  assert.ok(!obs.requests.some(request => request.type.startsWith('Set') || request.type.startsWith('Create')));
});

test('runtime lock refuses another live service and retains ownership until OBS exits', async t => {
  const { dir, obs, internal } = await fixture(t);
  const runtime = path.join(dir, 'runtime', 'obs-studio'); await mkdir(runtime, { recursive: true });
  await internal.acquireLock();
  const lock = path.join(runtime, '.riftcast-engine.lock');
  assert.equal(JSON.parse(await readFile(lock, 'utf8')).parentPid, process.pid);
  const other = new ObsEngine(obs as unknown as ObsClient, { root: dir, dataDir: path.join(dir, 'other-data'), overlayUrl, onConnection: () => {} }) as any;
  await assert.rejects(other.acquireLock(), /其他导播服务/);
  const child = new FakeChild(); internal.child = child; await internal.updateLock(child.pid);
  assert.equal(JSON.parse(await readFile(lock, 'utf8')).childPid, child.pid);
  await internal.releaseLock(); assert.ok(internal.lockToken);
  child.exit(); await internal.releaseLock();
  await assert.rejects(readFile(lock, 'utf8'), (error: any) => error.code === 'ENOENT');
  await other.acquireLock(); await other.releaseLock();
});

test('stale runtime lock is reclaimed only when both owner and child have exited', async t => {
  const { dir, internal } = await fixture(t);
  const runtime = path.join(dir, 'runtime', 'obs-studio'); await mkdir(runtime, { recursive: true });
  const lock = path.join(runtime, '.riftcast-engine.lock');
  await writeFile(lock, JSON.stringify({ parentPid: 2147483647, childPid: process.pid, token: 'orphan-test-token' }), 'utf8');
  await assert.rejects(internal.acquireLock(), /其他导播服务/);
  await writeFile(lock, JSON.stringify({ parentPid: 2147483647, childPid: 2147483646, token: 'stale-test-token' }), 'utf8');
  await internal.acquireLock();
  assert.equal(JSON.parse(await readFile(lock, 'utf8')).parentPid, process.pid);
  await internal.releaseLock();
});

test('live monitors capture new frames and create a visual-only preview without touching program or outputs', async t => {
  const { internal, obs, engine } = await fixture(t); internal.connected = true;
  obs.encoder = 'nvenc'; await engine.setup({});
  const programHud = obs.requests.find(r => r.type === 'CreateInput' && r.data.inputName === hud)!;
  assert.equal(programHud.data.inputSettings.fps, 60); assert.equal(programHud.data.inputSettings.fps_custom, true);
  obs.requests = [];
  obs.screenshot = 'data:image/jpeg;base64,' + Buffer.from([0xff,0xd8,1,2,0xff,0xd9]).toString('base64');
  await engine.liveFrame('preview'); await engine.liveFrame('preview'); await engine.liveFrame('program');
  const shots = obs.requests.filter(r => r.type === 'GetSourceScreenshot');
  assert.deepEqual(shots.map(r => r.data.sourceName), [enginePreviewScene,enginePreviewScene,engineScene]);
  assert.equal(shots.length, 3, 'continuous monitors never reuse the diagnostic snapshot cache');
  const previewHud = obs.requests.find(r => r.type === 'CreateInput' && r.data.inputName === 'RiftCast 预监 HUD');
  assert.equal(previewHud?.data.inputSettings.url, overlayUrl + '?preview=1'); assert.equal(previewHud?.data.inputSettings.reroute_audio, false);
  assert.equal(previewHud?.data.inputSettings.fps, 1); assert.equal(previewHud?.data.inputSettings.fps_custom, true);
  assert.equal(obs.requests.filter(r => r.type === 'CreateScene').length, 1);
  assert.ok(!obs.requests.some(r => /^(Start|Stop)(Stream|Record)$/.test(r.type) || r.type === 'SetCurrentProgramScene' || r.type === 'SetVideoSettings'));
  assert.ok(!obs.requests.some(r => r.type === 'CreateInput' && r.data.inputKind.includes('audio')));
  obs.emit('CurrentProgramSceneChanged', { sceneName: 'Updated program' }); await engine.liveFrame('program');
  assert.equal(obs.requests.at(-1)!.data.sourceName, 'Updated program');
});

test('reconnecting refreshes an existing preview HUD to 1 FPS while preserving the program HUD and game capture', async t => {
  const { internal, obs, engine } = await fixture(t); internal.connected = true; obs.encoder = 'nvenc';
  await engine.setup({});
  const programHud = obs.requests.find(r => r.type === 'CreateInput' && r.data.inputName === hud)!;
  assert.equal(programHud.data.inputSettings.fps, 60);
  // A portable OBS scene can already contain a preview source from an earlier service.
  obs.inputs.push({ inputName: 'RiftCast 预监 HUD', inputKind: 'browser_source' });
  obs.sceneItems.push({ sourceName: 'RiftCast 预监 HUD', sceneItemId: 100 });
  internal.livePreviewPrepared = true;
  obs.emit('ConnectionClosed'); obs.emit('Identified');
  assert.equal(internal.livePreviewPrepared, false, 'a new connection invalidates preparation state');
  obs.requests = [];
  obs.screenshot = 'data:image/jpeg;base64,' + Buffer.from([0xff,0xd8,1,0xff,0xd9]).toString('base64');
  await engine.liveFrame('preview');
  const update = obs.requests.find(r => r.type === 'SetInputSettings' && r.data.inputName === 'RiftCast 预监 HUD')!;
  assert.equal(update.data.inputSettings.fps, 1); assert.equal(update.data.inputSettings.fps_custom, true);
  assert.equal(update.data.inputSettings.url, overlayUrl + '?preview=1');
  assert.ok(!obs.requests.some(r => r.type === 'SetInputSettings' && [hud, game].includes(r.data.inputName)));
  assert.ok(!obs.requests.some(r => r.type === 'CreateInput' || r.type === 'SetVideoSettings' || r.type === 'SetCurrentProgramScene' || /^(Start|Stop)(Stream|Record)$/.test(r.type)));
  assert.equal(internal.livePreviewPrepared, true);
});

test('desktop monitor opens the correct native bus without screenshot polling or output actions', async t => {
  const { internal, obs, engine } = await fixture(t);
  internal.child = new FakeChild(); internal.connected = true; obs.encoder = 'nvenc';
  await engine.setup({}); obs.requests = [];
  const metadata = await engine.monitor({ kind: 'program', open: false });
  assert.equal(metadata.obsProcessId, internal.child.pid); assert.equal(metadata.fps, 60);
  assert.equal(obs.requests.length, 0, 'metadata lookup must not open a duplicate projector');
  await engine.monitor({ kind: 'program' });
  await engine.monitor({ kind: 'preview' });
  assert.deepEqual(obs.requests.filter(r => r.type === 'OpenVideoMixProjector').map(r => r.data), [
    { videoMixType: 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM', monitorIndex: -1 },
    { videoMixType: 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PREVIEW', monitorIndex: -1 },
  ]);
  assert.ok(!obs.requests.some(r => r.type === 'GetSourceScreenshot' || /^(Start|Stop)(Stream|Record)$/.test(r.type) || r.type === 'SetCurrentProgramScene'));
  await assert.rejects(engine.monitor({ kind: 'other' }), /类型无效/);
  await assert.rejects(engine.monitor({ kind: 'program', open: 'yes' }), /选项无效/);
  engine.mode = 'external';
  await assert.rejects(engine.monitor({ kind: 'program' }), /内置 OBS/);
});

test('live capture rejects invalid frames and external preview requires studio mode', async t => {
  const { internal, obs, engine } = await fixture(t); internal.connected = true;
  await assert.rejects(engine.liveFrame('program'), /无效预览/);
  obs.screenshot = 'data:image/jpeg;base64,' + Buffer.from([0xff,0xd8,1,0xff,0xd9]).toString('base64');
  engine.mode = 'external';
  const original = obs.call.bind(obs);
  obs.call = async (type, data) => type === 'GetStudioModeEnabled' ? { studioModeEnabled: false } : original(type,data);
  await assert.rejects(engine.liveFrame('preview'), /工作室模式/);
  await engine.liveFrame('program');
  assert.ok(!obs.requests.some(r => r.type === 'CreateScene' || r.type === 'CreateInput'));
});

test('engine mutations wait for the in-flight monitor and old connection work never prepares a new transport', async t => {
  const { internal, obs, engine } = await fixture(t); internal.connected = true; await engine.setup({}); obs.requests = [];
  obs.screenshot = 'data:image/jpeg;base64,' + Buffer.from([0xff,0xd8,1,0xff,0xd9]).toString('base64');
  const original = obs.call.bind(obs); let release!: () => void; let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  obs.call = async (type, data) => { if(type === 'GetSourceScreenshot') { started(); await held; } return original(type,data); };
  const frame = engine.liveFrame('program'); await entered;
  const setup = engine.setup({}); await new Promise(resolve => setTimeout(resolve,10));
  assert.ok(!obs.requests.some(r => r.type === 'SetVideoSettings'), 'settings cannot change under an active readback');
  release(); await frame; await setup;
  obs.call = original; obs.requests = [];
  let releasePrepare!: () => void, startedPrepare!: () => void;
  const enteredPrepare = new Promise<void>(resolve => { startedPrepare = resolve; });
  const heldPrepare = new Promise<void>(resolve => { releasePrepare = resolve; });
  obs.call = async (type,data) => { if(type === 'GetInputList') { startedPrepare(); await heldPrepare; } return original(type,data); };
  const preparing = engine.liveFrame('preview'); await enteredPrepare;
  obs.emit('ConnectionClosed'); obs.emit('Identified'); releasePrepare();
  await assert.rejects(preparing, /连接已变化/);
  assert.ok(!obs.requests.some(r => r.type === 'CreateScene' || r.type === 'CreateInput'));
  assert.equal(internal.livePreviewPrepared, false);
});

test('owned preview reactivates after studio mode or its bus is changed', async t => {
  const { internal, obs, engine } = await fixture(t); internal.connected = true; await engine.setup({});
  obs.screenshot = 'data:image/jpeg;base64,' + Buffer.from([0xff,0xd8,1,0xff,0xd9]).toString('base64');
  await engine.liveFrame('preview'); assert.equal(internal.livePreviewPrepared, true);
  obs.emit('StudioModeStateChanged', { studioModeEnabled: false }); assert.equal(internal.livePreviewPrepared, false);
  await engine.liveFrame('preview');
  obs.emit('CurrentPreviewSceneChanged', { sceneName: 'Other preview' }); assert.equal(internal.livePreviewPrepared, false);
  await engine.liveFrame('preview');
  assert.equal(obs.requests.filter(r => r.type === 'SetCurrentPreviewScene').length, 3);
});

test('Douyin destination persists and virtual camera starts independently of RTMP and recording', async t => {
  const { dir, engine, internal, obs } = await fixture(t);
  internal.connected = true; await engine.setup({});
  await engine.setDestination({ destination: 'douyin' });
  obs.requests = [];
  const started = await engine.output({ action: 'start-virtual-camera' });
  assert.equal(started.virtualCamActive, true);
  assert.equal(started.streamActive, false);
  assert.equal(started.recordActive, false);
  assert.equal(started.destination, 'douyin');
  assert.equal(started.companionAudio.active, true);
  assert.ok(!obs.requests.some(r => ['StartStream', 'StopStream', 'StartRecord', 'StopRecord', 'SetCurrentProgramScene', 'SetCurrentPreviewScene'].includes(r.type)));
  await engine.output({ action: 'start-virtual-camera' });
  assert.equal(obs.requests.filter(r => r.type === 'StartVirtualCam').length, 1, 'start is idempotent after live state confirmation');
  const saved = JSON.parse(await readFile(path.join(dir, 'data/obs-engine.json'), 'utf8'));
  assert.equal(saved.selection.destination, 'douyin');
  assert.equal(saved.virtualCamActive, undefined, 'active outputs never auto-start from persisted configuration');
  await engine.initialize(); assert.equal((await engine.status()).destination, 'douyin');
  const stopped = await engine.output({ action: 'stop-virtual-camera' });
  assert.equal(stopped.virtualCamActive, false);
  assert.equal(stopped.companionAudio.active, false);
  assert.equal(stopped.destination, 'douyin');
});

test('window route prepares and controls audio without registering or starting a virtual camera', async t => {
  const { engine, internal, obs } = await fixture(t);
  internal.connected = true; await engine.setup({});
  await engine.setDestination({ destination: 'douyin' });
  internal.cameraDriver.install = async () => { throw new Error('camera installation must not run'); };
  await engine.prepareCompanion({ video: 'window' });
  obs.requests = [];
  assert.equal((await engine.output({ action: 'start-companion-audio' })).companionAudio.active, true);
  await assert.rejects(engine.setDestination({ destination: 'rtmp' }), /停止伴侣混音/);
  assert.equal((await engine.output({ action: 'stop-companion-audio' })).companionAudio.active, false);
  assert.ok(!obs.requests.some(r => ['StartVirtualCam', 'StopVirtualCam', 'StartStream', 'StartRecord'].includes(r.type)));
  await assert.rejects(engine.prepareCompanion({ video: 'invalid' }), /路径无效/);
});

test('companion audio failure prevents partial camera start and cleans up the attempted route', async t => {
  const { engine, internal, obs } = await fixture(t); internal.connected = true; await engine.setup({}); await engine.setDestination({ destination: 'douyin' });
  let stopped = 0; internal.companionAudio.start = async () => { throw new Error('mix-device-failed'); };
  internal.companionAudio.stop = async () => { stopped++; };
  await assert.rejects(engine.output({ action: 'start-virtual-camera' }), /mix-device-failed/);
  assert.equal(obs.camera.outputActive, false); assert.equal(stopped, 1);
  assert.ok(!obs.requests.some(request => request.type === 'StartVirtualCam'));
});
test('audio-only owned route also prevents source and destination mutations until stopped', async t => {
  const { engine, internal } = await fixture(t); internal.connected = true; await engine.setup({});
  await internal.companionAudio.start();
  await assert.rejects(engine.setup({}), /停止伴侣混音/);
  await assert.rejects(engine.setDestination({ destination: 'douyin' }), /停止伴侣混音/);
  await internal.companionAudio.stop(); await engine.setDestination({ destination: 'douyin' });
});
test('owned audio loader preserves unrelated scripts, supports Unicode paths and leaves one recovery backup', async t => {
  const { dir, internal } = await fixture(t); await internal.prepareConfig(12345, 'fixture-secret');
  const runtime = path.join(dir, 'runtime/obs-studio');
  await mkdir(path.join(runtime, 'bin/64bit'), { recursive: true }); await mkdir(path.join(runtime, 'data/riftcast'), { recursive: true });
  await writeFile(path.join(runtime, 'bin/64bit/riftcast-audio-bridge.dll'), 'fixture');
  await writeFile(path.join(runtime, 'data/riftcast/riftcast-audio.lua'), 'fixture');
  const file = path.join(runtime, 'config/obs-studio/basic/scenes/RiftCast.json');
  const collection = JSON.parse(await readFile(file, 'utf8')); collection.modules = { other: { preserved: true }, 'scripts-tool': [{ path: 'D:/用户/custom.lua', settings: { userValue: 3 } }] };
  await writeFile(file, JSON.stringify(collection)); await internal.prepareAudioBridgeConfig(file);
  const backup = await readFile(file + '.before-audio-bridge', 'utf8'); await internal.prepareAudioBridgeConfig(file);
  const result = JSON.parse(await readFile(file, 'utf8')); assert.equal(result.modules.other.preserved, true);
  assert.equal(result.modules['scripts-tool'].length, 2); assert.equal(result.modules['scripts-tool'][0].settings.userValue, 3);
  assert.equal(result.modules['scripts-tool'][1].settings.library, path.join(runtime, 'bin/64bit/riftcast-audio-bridge.dll').replaceAll('\\', '/'));
  assert.equal(await readFile(file + '.before-audio-bridge', 'utf8'), backup);
});

test('live virtual camera prevents source, engine, destination and driver changes', async t => {
  const { engine, internal, obs } = await fixture(t);
  internal.connected = true; obs.camera.outputActive = true;
  for (const change of [() => engine.setup({}), () => engine.setMode({ mode: 'external' }), () => engine.setDestination({ destination: 'rtmp' }), () => engine.installVirtualCamera()]) {
    obs.requests = [];
    await assert.rejects(change(), /先停止伴侣画面/);
    assert.ok(obs.requests.every(r => ['GetStreamStatus', 'GetRecordStatus', 'GetVirtualCamStatus'].includes(r.type)));
  }
  obs.camera.outputActive = undefined as any;
  await assert.rejects(engine.setup({}), /无法确认虚拟摄像头状态/);
  assert.equal((await engine.status()).virtualCamActive, null, 'unknown camera state never reports stopped');
});

test('companion output rejects missing registration, missing sources and unintended RTMP starts', async t => {
  const { engine, internal, obs } = await fixture(t);
  internal.connected = true;
  await engine.setDestination({ destination: 'douyin' });
  await assert.rejects(engine.output({ action: 'start-stream' }), /当前为直播伴侣输出/);
  internal.cameraDriver.status = async () => ({ available: true, installed: false });
  await assert.rejects(engine.output({ action: 'start-virtual-camera' }), /请先安装虚拟摄像头/);
  internal.cameraDriver.status = async () => ({ available: true, installed: true });
  await assert.rejects(engine.output({ action: 'start-virtual-camera' }), /先应用内置引擎/);
  assert.ok(!obs.requests.some(r => ['StartStream', 'StartVirtualCam'].includes(r.type)));
  await assert.rejects(engine.setDestination({ destination: 'unknown' }), /方式无效/);
  engine.mode = 'external';
  await assert.rejects(engine.setDestination({ destination: 'douyin' }), /内置 OBS/);
});

test('virtual camera start and stop wait for actual output state rather than the RPC acknowledgement', async t => {
  const { engine, internal, obs } = await fixture(t);
  internal.connected = true; await engine.setup({});
  await engine.setDestination({ destination: 'douyin' });
  const original = obs.call.bind(obs);
  let pending: boolean | undefined, polls = 0;
  obs.call = async (type, data) => {
    if (type === 'StartVirtualCam' || type === 'StopVirtualCam') { obs.requests.push({ type, data }); pending = type === 'StartVirtualCam'; polls = 0; return {}; }
    if (type === 'GetVirtualCamStatus' && pending !== undefined) { polls++; if (polls >= 3) { obs.camera.outputActive = pending; pending = undefined; } }
    return original(type, data);
  };
  assert.equal((await engine.output({ action: 'start-virtual-camera' })).virtualCamActive, true);
  assert.ok(polls >= 3);
  assert.equal((await engine.output({ action: 'stop-virtual-camera' })).virtualCamActive, false);
  assert.ok(polls >= 3);
});

test('owned virtual camera closes with its engine while external OBS camera remains untouched', async t => {
  const { engine, internal, obs } = await fixture(t);
  internal.connected = true; internal.child = new FakeChild(); obs.camera.outputActive = true;
  await engine.close();
  assert.equal(obs.camera.outputActive, false);
  assert.ok(obs.requests.some(r => r.type === 'StopVirtualCam'));
  const external = await fixture(t); external.engine.mode = 'external'; external.internal.connected = true; external.obs.camera.outputActive = true;
  await external.engine.close();
  assert.equal(external.obs.camera.outputActive, true);
  assert.ok(!external.obs.requests.some(r => r.type === 'StopVirtualCam'));
});

test('owned collection migrates virtual camera to Program while preserving original scene configuration', async t => {
  const { dir, internal } = await fixture(t);
  await internal.prepareConfig(12345, 'test-config-password');
  const collectionFile = path.join(dir, 'runtime/obs-studio/config/obs-studio/basic/scenes/RiftCast.json');
  const original = JSON.parse(await readFile(collectionFile, 'utf8'));
  original['virtual-camera'] = { type2: 4 }; original.preservedSetting = 'keep';
  await writeFile(collectionFile, JSON.stringify(original));
  await internal.prepareConfig(12346, 'test-config-password');
  const migrated = JSON.parse(await readFile(collectionFile, 'utf8'));
  assert.deepEqual(migrated['virtual-camera'], { type2: 3 });
  assert.equal(migrated.preservedSetting, 'keep');
  assert.deepEqual(migrated.sources, original.sources);
  assert.equal(migrated.current_program_scene, original.current_program_scene);
  assert.ok(await readFile(collectionFile + '.before-virtual-camera', 'utf8'));
});

test('an unavailable virtual camera plugin does not block RTMP setup and cannot report a running camera', async t => {
  const { engine, internal, obs } = await fixture(t);
  internal.connected = true;
  const original = obs.call.bind(obs);
  obs.call = async (type, data) => {
    if (type === 'GetVirtualCamStatus') throw Object.assign(new Error('VirtualCam is not available.'), { code: 604 });
    return original(type, data);
  };
  await engine.setup({});
  const status = await engine.status();
  assert.equal(status.connected, true);
  assert.equal(status.virtualCamActive, false);
  assert.equal(status.virtualCamera.requiresRestart, true);
  await engine.setDestination({ destination: 'douyin' });
  await assert.rejects(engine.output({ action: 'start-virtual-camera' }), /重新加载摄像头/);
  assert.ok(!obs.requests.some(r => r.type === 'StartVirtualCam'));
});

test('successful first registration restarts only the inactive owned engine to load the camera plugin', async t => {
  const { engine, internal, obs } = await fixture(t);
  const child = new FakeChild();
  internal.connected = true; internal.child = child;
  let installed = false, launches = 0;
  internal.cameraDriver.status = async () => ({ available: true, installed });
  internal.cameraDriver.install = async () => { installed = true; return { available: true, installed: true }; };
  internal.launch = async () => { launches++; internal.child = new FakeChild(); obs.emit('Identified'); };
  await engine.installVirtualCamera();
  assert.equal(installed, true);
  assert.equal(child.exitCode, 0);
  assert.equal(launches, 1);
  assert.equal((await engine.status()).connected, true);
  assert.ok(!obs.requests.some(r => ['StartStream', 'StartRecord', 'StartVirtualCam'].includes(r.type)));
});
