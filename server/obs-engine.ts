import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import type { OBSRequestTypes, OBSResponseTypes } from 'obs-websocket-js';
import { ObsClient } from './obs-client';
import { ObsPerformanceMonitor, type ObsPerformance } from './obs-performance';
import { record, str, ValidationError } from './state';
import { OBS_SNAPSHOT_INTERVAL_MS } from '../shared/obs-preview-policy';
import { prepareEmergencyCollection } from './obs-emergency';
export { emergencyScene } from './obs-emergency';

const runFile = promisify(execFile);
export const engineScene = 'RiftCast 节目';
export const enginePreviewScene = 'RiftCast 预监';
const previewHudInput = 'RiftCast 预监 HUD';
const gameInput = 'RiftCast 游戏画面';
const desktopInput = 'RiftCast 桌面音频';
const micInput = 'RiftCast 解说麦克风';
const hudInput = 'RiftCast HUD';
type Mode = 'embedded' | 'external';
type Choice = { name: string; value: string };
type Selection = { gameWindow: string; desktopDevice: string; micDevice: string; micEnabled: boolean; outputFps?: 30 | 60 };
type InputSettings = NonNullable<OBSRequestTypes['CreateInput']['inputSettings']>;
const isRunning = (child?: ChildProcess): child is ChildProcess => Boolean(child && child.exitCode === null && child.signalCode === null);
const isLeagueWindow = (value: string) => /(?:^|:)League of Legends\.exe$/i.test(value);
function processExists(pid: unknown) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid < 1 || pid > 2147483647) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
export interface ObsEngineOptions { root: string; dataDir: string; overlayUrl: string; onConnection: (status: 'connected' | 'disconnected' | 'connecting' | 'error', detail: string) => void }

/** An isolated official OBS process, controlled entirely through the director UI. */
export class ObsEngine {
  recordingPath?:string;
  private previewFps=1;
  mode: Mode = process.env.RIFTCAST_OBS_MODE === 'external' ? 'external' : 'embedded';
  private child?: ChildProcess;
  private endpoint?: { url: string; password: string };
  private lockToken?: string;
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private windowTimer?: ReturnType<typeof setInterval>;
  private windowPolling?: Promise<void>;
  private busy = false;
  private operation?: Promise<unknown>;
  private closing = false;
  private connected = false;
  private performanceMonitor = new ObsPerformanceMonitor();
  private outputActive = false;
  private videoSettings?: { fps: number; encoder: string };
  private previewCache?: { imageData: string; capturedAt: number; nextRefreshMs: number };
  private previewPending?: Promise<{ imageData: string; capturedAt: number; nextRefreshMs: number }>;
  private liveProgramScene?: string;
  private livePreviewPrepared = false;
  private livePreviewPreparing?: Promise<void>;
  private liveCapture: Promise<unknown> = Promise.resolve();
  private connectionGeneration = 0;
  private version = '';
  private error = '';
  private selection: Selection = { gameWindow: '', desktopDevice: 'default', micDevice: 'default', micEnabled: false };
  private capabilities = { gameWindows: [] as Choice[], audioOutputs: [] as Choice[], audioInputs: [] as Choice[] };
  private get runtimeRoot() { return path.join(this.options.root, 'runtime', 'obs-studio'); }
  private get selectionFile() { return path.join(this.options.dataDir, 'obs-engine.json'); }
  private get lockFile() { return path.join(this.runtimeRoot, '.riftcast-engine.lock'); }
  constructor(private obs: ObsClient, private options: ObsEngineOptions) {
    obs.on('ConnectionClosed', () => { this.connectionGeneration++; this.connected = false; this.previewCache = undefined; this.liveProgramScene = undefined; this.livePreviewPrepared = false; this.videoSettings = undefined; this.performanceMonitor.reset(); });
    obs.on('Identified', () => { this.connectionGeneration++; this.connected = true; });
    obs.on('CurrentProgramSceneChanged', event => { this.previewCache = undefined; this.liveProgramScene = event.sceneName; });
    obs.on('StudioModeStateChanged', event => { if (!event.studioModeEnabled) this.livePreviewPrepared = false; });
    obs.on('CurrentPreviewSceneChanged', event => { if (event.sceneName !== enginePreviewScene) this.livePreviewPrepared = false; });
    obs.on('StreamStateChanged', event => { this.outputActive = event.outputActive || this.outputActive; this.previewCache = undefined; });
    obs.on('RecordStateChanged', () => { this.previewCache = undefined; });
  }
  async initialize() {
    try {
      const saved = record(JSON.parse(await readFile(this.selectionFile, 'utf8')));
      if (process.env.RIFTCAST_OBS_MODE === undefined && saved.mode === 'external') this.mode = 'external';
      const selection = record(saved.selection);
      for (const key of ['gameWindow', 'desktopDevice', 'micDevice'] as const) if (typeof selection[key] === 'string') this.selection[key] = str(selection[key], 1024);
      if (typeof selection.micEnabled === 'boolean') this.selection.micEnabled = selection.micEnabled;
      if (selection.outputFps === 30 || selection.outputFps === 60) this.selection.outputFps = selection.outputFps;
    } catch { /* First run uses an isolated engine with muted microphone. */ }
    try { this.version = str(record(JSON.parse(await readFile(path.join(this.runtimeRoot, '.riftcast-runtime.json'), 'utf8'))).version, 40); } catch { /* Preparation has not run yet. */ }
  }
  private async save() {
    await mkdir(this.options.dataDir, { recursive: true });
    await writeFile(`${this.selectionFile}.tmp`, JSON.stringify({ mode: this.mode, selection: this.selection }, null, 2), 'utf8');
    await rename(`${this.selectionFile}.tmp`, this.selectionFile);
  }
  private async call<T extends keyof OBSRequestTypes>(request: T, data?: OBSRequestTypes[T]): Promise<OBSResponseTypes[T]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([this.obs.call(request, data), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error()), 8000); })]);
    } catch { throw new Error(`OBS 操作未完成（${request}），请检查引擎连接`); }
    finally { if (timer) clearTimeout(timer); }
  }
  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.closing) throw new ValidationError('输出引擎正在关闭');
    if (this.busy || this.starting) throw new ValidationError('输出引擎正在处理操作，请稍后再试');
    this.busy = true;
    try {
      const operation = (async () => { await this.liveCapture.catch(() => {}); if (this.closing) throw new ValidationError('输出引擎正在关闭'); return work(); })();
      this.operation = operation; return await operation;
    } finally { this.operation = undefined; this.busy = false; }
  }
  private async requireStopped() {
    const [stream, recording] = await Promise.all([this.call('GetStreamStatus'), this.call('GetRecordStatus')]);
    if (typeof stream.outputActive !== 'boolean' || typeof stream.outputReconnecting !== 'boolean' || typeof recording.outputActive !== 'boolean') throw new Error('无法确认输出是否已停止，请重新连接引擎');
    if (stream.outputActive || stream.outputReconnecting || recording.outputActive) throw new ValidationError('请先在工作台停止推流和录制，再修改输出引擎');
  }
  async status() {
    let available = false;
    try { await access(path.join(this.runtimeRoot, 'bin', '64bit', 'obs64.exe')); available = true; } catch { /* Available after runtime preparation. */ }
    const base = { mode: this.mode, available, running: this.mode === 'external' ? this.connected : isRunning(this.child), connected: this.connected, version: this.version, sceneName: engineScene, streamActive: false, recordActive: false, inputs: [] as { inputName: string; inputKind: string; inputMuted?: boolean }[], capabilities: this.capabilities, selection: this.selection, performance: undefined as ObsPerformance | undefined, ...(this.error ? { error: this.error } : {}) };
    if (!this.connected || this.starting) return base;
    try {
      const [stream, recording, sources, scenes] = await Promise.all([this.call('GetStreamStatus'), this.call('GetRecordStatus'), this.call('GetInputList'), this.call('GetSceneList')]);
      base.streamActive = stream.outputActive || stream.outputReconnecting;
      base.recordActive = recording.outputActive;
      this.outputActive = base.streamActive || base.recordActive;
      base.sceneName = scenes.currentProgramSceneName;
      base.inputs = sources.inputs.map(input => ({ inputName: String(input.inputName), inputKind: String(input.inputKind), ...(input.inputName === micInput ? { inputMuted: !this.selection.micEnabled } : {}) }));
      // Diagnostics are optional: an older external OBS must retain its output controls.
      try {
        if (!this.videoSettings) {
          const mode = this.mode === 'external' ? await this.call('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'Mode' }) : undefined;
          const advanced = mode?.parameterValue === 'Advanced';
          const [video, profile] = await Promise.all([this.call('GetVideoSettings'), this.call('GetProfileParameter', { parameterCategory: advanced ? 'AdvOut' : 'SimpleOutput', parameterName: advanced ? 'Encoder' : 'StreamEncoder' })]);
          this.videoSettings = { fps: video.fpsNumerator / video.fpsDenominator, encoder: typeof profile.parameterValue === 'string' ? profile.parameterValue : '' };
        }
        const stats = await this.call('GetStats');
        if (typeof stats.activeFps === 'number') base.performance = this.performanceMonitor.sample(stats, stream, this.outputActive, this.videoSettings.fps, this.videoSettings.encoder);
      } catch { /* Optional statistics never mark a healthy connection as disconnected. */ }
    } catch { base.connected = false; base.error = '输出引擎状态读取失败，请重新连接'; }
    return base;
  }
  async start() {
    if (this.closing) throw new Error('输出引擎正在关闭');
    if (this.mode !== 'embedded') throw new ValidationError('请先选择内置 OBS 引擎');
    if (this.starting) { await this.starting; return this.status(); }
    if (isRunning(this.child) && this.connected) return this.status();
    if (this.busy) throw new ValidationError('输出引擎正在处理操作，请稍后再试');
    this.starting = this.launch();
    try { await this.starting; } finally { this.starting = undefined; }
    return this.status();
  }
  private async launch() {
    this.error = '';
    this.options.onConnection('connecting', '正在启动内置 OBS 引擎');
    const executable = path.join(this.runtimeRoot, 'bin', '64bit', 'obs64.exe');
    // Recover the owned live process without interrupting a stream or recording.
    if (isRunning(this.child)) {
      try {
        if (!this.endpoint) throw new Error();
        await this.connectEndpoint(this.endpoint);
        this.error = '';
        this.beginWindowRefresh();
        this.options.onConnection('connected', `内置 OBS ${this.version} 已重新连接`);
        return;
      } catch {
        this.error = '内置 OBS 仍在运行，连接恢复失败；请检查引擎窗口，现有输出已保留';
        this.options.onConnection('error', this.error);
        throw new Error(this.error);
      }
    }
    try {
      if (process.platform !== 'win32') throw new Error('内置 OBS 引擎当前支持 Windows x64');
      try { await access(executable); } catch { throw new Error('内置 OBS 运行时尚未准备，请运行 npm run setup:obs 或使用启动导播.cmd'); }
      await this.acquireLock();
      const socketPort = await new Promise<number>((resolve, reject) => {
        const probe = net.createServer(); probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => { const address = probe.address() as net.AddressInfo; probe.close(error => error ? reject(error) : resolve(address.port)); });
      });
      const password = randomBytes(32).toString('base64url');
      await this.prepareConfig(socketPort, password);
      await this.obs.disconnect().catch(() => {});
      const child = spawn(executable, ['--portable', '--multi', '--minimize-to-tray', '--disable-updater', '--disable-missing-files-check', '--only-bundled-plugins', '--profile', 'RiftCast', '--collection', 'RiftCast'], { cwd: path.dirname(executable), windowsHide: true, stdio: 'ignore' });
      this.child = child;
      this.endpoint = { url: `ws://127.0.0.1:${socketPort}`, password };
      let failed = false;
      child.once('error', () => { failed = true; });
      child.once('exit', () => {
        if (this.child !== child) return;
        this.connected = false;
        this.endpoint = undefined;
        this.endWindowRefresh();
        void this.releaseLock();
        if (!this.closing && !this.stopping && this.mode === 'embedded') { this.error = '内置 OBS 已退出，请点击启动引擎重试'; this.options.onConnection('disconnected', this.error); }
      });
      await this.updateLock(child.pid);
      const deadline = Date.now() + 35000;
      while (Date.now() < deadline && !this.closing) {
        if (failed || !isRunning(child)) throw new Error('内置 OBS 启动失败，请检查运行时和显卡驱动');
        try { await this.connectEndpoint(this.endpoint); break; }
        catch { await new Promise(resolve => setTimeout(resolve, 400)); }
      }
      if (!this.connected) throw new Error('内置 OBS 连接超时，请检查运行时日志后重试');
      await this.waitReady(child);
      await this.configureSources({});
      if (this.closing || !isRunning(child)) throw new Error('内置 OBS 启动已取消');
      this.beginWindowRefresh();
      this.options.onConnection('connected', `内置 OBS ${this.version} · 游戏画面与 HUD 已配置`);
    } catch (error) {
      this.error = error instanceof Error ? error.message : '内置 OBS 启动失败';
      await this.obs.disconnect().catch(() => {});
      await this.stopOwnedProcess();
      this.options.onConnection('error', this.error);
      throw new Error(this.error);
    }
  }
  private async acquireLock() {
    if (this.lockToken) return;
    const token = randomBytes(16).toString('hex');
    const contents = JSON.stringify({ parentPid: process.pid, childPid: null, token });
    const create = () => writeFile(this.lockFile, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    try { await create(); this.lockToken = token; return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error('无法锁定内置 OBS 配置目录，请检查目录写入权限'); }
    // Serialize stale-lock recovery so two servers cannot delete each other's new lock.
    const claimFile = `${this.lockFile}.claim`;
    try { await writeFile(claimFile, String(process.pid), { encoding: 'utf8', flag: 'wx' }); }
    catch { throw new ValidationError('内置 OBS 正由其他导播服务使用，请关闭该服务后重试'); }
    try {
      let owner: Record<string, unknown>;
      try { owner = record(JSON.parse(await readFile(this.lockFile, 'utf8'))); }
      catch { throw new ValidationError('内置 OBS 锁文件不可读取，请确认原导播服务和 OBS 已退出后重新准备运行时'); }
      if (typeof owner.token !== 'string' || processExists(owner.parentPid) || processExists(owner.childPid)) throw new ValidationError('内置 OBS 正由其他导播服务使用，请关闭该服务后重试');
      await unlink(this.lockFile);
      try { await create(); this.lockToken = token; }
      catch { throw new ValidationError('内置 OBS 正由其他导播服务使用，请关闭该服务后重试'); }
    } finally { await unlink(claimFile).catch(() => {}); }
  }
  private async updateLock(childPid: number | undefined) {
    if (!this.lockToken) return;
    const owner = record(JSON.parse(await readFile(this.lockFile, 'utf8')));
    if (owner.token !== this.lockToken) throw new Error('内置 OBS 配置目录锁已发生变化');
    await writeFile(`${this.lockFile}.tmp`, JSON.stringify({ parentPid: process.pid, childPid: childPid ?? null, token: this.lockToken }), { encoding: 'utf8', mode: 0o600 });
    await rename(`${this.lockFile}.tmp`, this.lockFile);
  }
  private async releaseLock() {
    const token = this.lockToken;
    if (!token || isRunning(this.child)) return;
    this.lockToken = undefined;
    try { const owner = record(JSON.parse(await readFile(this.lockFile, 'utf8'))); if (owner.token === token) await unlink(this.lockFile); } catch { /* A missing lock is already released. */ }
  }
  private async waitReady(child: ChildProcess) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline && !this.closing && isRunning(child)) {
      try {
        const scenes = await this.call('GetSceneList');
        const [stream, recording] = await Promise.all([this.call('GetStreamStatus'), this.call('GetRecordStatus')]);
        if (Array.isArray(scenes.scenes) && scenes.scenes.length && typeof scenes.currentProgramSceneName === 'string' && scenes.currentProgramSceneName && typeof stream.outputActive === 'boolean' && typeof recording.outputActive === 'boolean') return;
      } catch { /* WebSocket can identify before OBS finishes loading its collection. */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('内置 OBS 场景载入未完成，请检查引擎日志后重试');
  }
  private async connectEndpoint(endpoint: { url: string; password: string }) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.obs.connect(endpoint.url, endpoint.password, { rpcVersion: 1, eventSubscriptions: 131071 }), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error()), 2500); })]);
      if (this.closing) throw new Error();
      this.connected = true;
    } catch {
      this.connected = false;
      await this.obs.disconnect().catch(() => {});
      throw new Error('内置 OBS 连接尚未就绪');
    } finally { if (timer) clearTimeout(timer); }
  }
  private async prepareConfig(port: number, password: string) {
    const config = path.join(this.runtimeRoot, 'config', 'obs-studio');
    const profile = path.join(config, 'basic', 'profiles', 'RiftCast');
    const scenes = path.join(config, 'basic', 'scenes');
    const plugin = path.join(config, 'plugin_config', 'obs-websocket');
    await Promise.all([mkdir(profile, { recursive: true }), mkdir(scenes, { recursive: true }), mkdir(plugin, { recursive: true })]);
    const initial = async (file: string, contents: string) => { try { await writeFile(file, contents, { encoding: 'utf8', flag: 'wx' }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; } };
    const userConfig = '[General]\nFirstRun=true\nLanguage=zh-CN\n\n[Basic]\nProfile=RiftCast\nProfileDir=RiftCast\nSceneCollection=RiftCast\nSceneCollectionFile=RiftCast\nConfigOnNewProfile=false\n\n[BasicWindow]\nSysTrayEnabled=true\nSysTrayWhenStarted=true\nWarnBeforeStartingStream=false\nWarnBeforeStoppingStream=false\nWarnBeforeStoppingRecord=false\n';
    const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(this.version) ?? /^(\d+)\.(\d+)\.(\d+)$/.exec('32.2.2')!;
    const infoVersion = (Number(version[1]) * 16777216 + Number(version[2]) * 65536 + Number(version[3])) * 65536;
    await initial(path.join(config, 'global.ini'), `[General]\nEnableAutoUpdates=false\nInfoLastVersion=${infoVersion}\nInfoIncrement=2147483647\n`);
    await initial(path.join(config, 'user.ini'), userConfig);
    await this.updateIni(path.join(config, 'global.ini'), { General: { EnableAutoUpdates: 'false', InfoLastVersion: String(infoVersion), InfoIncrement: '2147483647' } });
    await this.updateIni(path.join(config, 'user.ini'), { General: { FirstRun: 'true', ConfirmOnExit: 'false' }, Basic: { ConfigOnNewProfile: 'false' }, BasicWindow: { SaveProjectors: 'false', SysTrayEnabled: 'true', SysTrayWhenStarted: 'true', WarnBeforeStartingStream: 'false', WarnBeforeStoppingStream: 'false', WarnBeforeStoppingRecord: 'false' } });
    const recordings = path.join(this.options.dataDir, 'videos'); await mkdir(recordings, { recursive: true });
    await initial(path.join(profile, 'basic.ini'), `[General]\nName=RiftCast\n\n[Video]\nBaseCX=1920\nBaseCY=1080\nOutputCX=1920\nOutputCY=1080\nFPSType=0\nFPSCommon=30\n\n[Output]\nMode=Simple\n\n[SimpleOutput]\nVBitrate=6000\nABitrate=160\nStreamEncoder=x264\nRecEncoder=x264\nRecQuality=Stream\nRecFormat2=mkv\nFilePath=${recordings.replaceAll('\\', '/')}\n\n[Audio]\nSampleRate=48000\nChannelSetup=Stereo\n`);
    // This method runs only after owning the lock and before spawning OBS. Never edit a live profile.
    const profileFile = path.join(profile, 'basic.ini');
    // Keep one local rollback copy; it contains no RTMP service settings or WebSocket password.
    await initial(`${profileFile}.before-performance`, await readFile(profileFile, 'utf8'));
    const encoder = await this.preferredEncoder();
    const fps = encoder === 'x264' ? 30 : this.selection.outputFps ?? 60;
    await this.updateIni(profileFile, { Video: { BaseCX: '1920', BaseCY: '1080', OutputCX: '1920', OutputCY: '1080', FPSType: '2', FPSCommon: String(fps), FPSNum: String(fps), FPSDen: '1', ColorFormat: 'NV12', ColorSpace: '709', ColorRange: 'Partial' }, Output: { Mode: 'Simple' }, SimpleOutput: { StreamEncoder: encoder, RecEncoder: encoder, RecQuality: 'Stream', Preset: 'superfast', NVENCPreset2: 'p4' } });
    await initial(path.join(scenes, 'RiftCast.json'), JSON.stringify({ name: 'RiftCast', current_scene: engineScene, current_program_scene: engineScene, scene_order: [{ name: engineScene }], sources: [{ name: engineScene, id: 'scene', settings: { items: [] } }], groups: [], quick_transitions: [] }));
    await this.updateIni(profileFile,{SimpleOutput:{RecRB:'true',RecRBTime:'60',RecRBSize:'512',RecFormat2:'mkv'}});
    await prepareEmergencyCollection(path.join(scenes,'RiftCast.json'),this.options.dataDir);
    // Never pass authentication in command-line arguments or send it to the renderer.
    const pluginFile = path.join(plugin, 'config.json');
    await writeFile(`${pluginFile}.tmp`, JSON.stringify({ first_load: false, server_enabled: true, server_port: port, alerts_enabled: false, auth_required: true, server_password: password }), { encoding: 'utf8', mode: 0o600 });
    await rename(`${pluginFile}.tmp`, pluginFile);
  }
  private async preferredEncoder(): Promise<string> {
    // OBS validates this selection against its loaded encoders at startup and falls back to x264.
    // Detect the current machine rather than reusing a GPU name from an older portable log.
    if (process.platform !== 'win32') return 'x264';
    try {
      const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'], { windowsHide: true, timeout: 5000, maxBuffer: 32768 });
      if (/NVIDIA (?:GeForce|RTX|Quadro|Tesla)/i.test(stdout)) return 'nvenc';
      if (/AMD Radeon/i.test(stdout)) return 'amd';
      if (/Intel\(R\).*?(?:Graphics|Arc)|Intel.*?Arc/i.test(stdout)) return 'qsv';
    } catch { /* Safe software fallback on hosts with no available hardware probe. */ }
    return 'x264';
  }
  private async updateIni(file: string, updates: Record<string, Record<string, string>>) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    for (const [section, values] of Object.entries(updates)) {
      let start = lines.findIndex(line => line.trim().toLowerCase() === `[${section.toLowerCase()}]`);
      if (start < 0) { lines.push('', `[${section}]`); start = lines.length - 1; }
      let end = start + 1;
      while (end < lines.length && !/^\s*\[.*\]\s*$/.test(lines[end])) end++;
      for (const [key, value] of Object.entries(values)) {
        let found = false;
        for (let index = start + 1; index < end; index++) if (lines[index].split('=', 1)[0].trim().toLowerCase() === key.toLowerCase()) { lines[index] = `${key}=${value}`; found = true; }
        if (!found) { lines.splice(end, 0, `${key}=${value}`); end++; }
      }
    }
    await writeFile(`${file}.tmp`, lines.join('\n'), 'utf8');
    await rename(`${file}.tmp`, file);
  }
  async setMode(input: unknown) {
    const mode = record(input).mode;
    if (mode !== 'embedded' && mode !== 'external') throw new ValidationError('输出引擎模式无效');
    if (mode === this.mode) return this.status();
    await this.exclusive(async () => {
      if (this.connected) await this.requireStopped();
      // If our process is running but disconnected, its output state is unknown.
      else if (isRunning(this.child)) throw new ValidationError('内置引擎连接已断开，请重新连接并确认输出已停止');
      await this.obs.disconnect().catch(() => {});
      await this.stopOwnedProcess();
      this.mode = mode;
      this.error = '';
      this.options.onConnection('disconnected', mode === 'embedded' ? '内置 OBS 等待启动' : '外部 OBS 等待连接');
      await this.save();
    });
    return this.status();
  }
  private async choices(inputName: string, propertyName: string): Promise<Choice[]> {
    const result = await this.call('GetInputPropertiesListPropertyItems', { inputName, propertyName });
    return result.propertyItems.filter(item => item.itemEnabled !== false && typeof item.itemValue === 'string').map(item => ({ name: String(item.itemName), value: String(item.itemValue) }));
  }
  private async ensureInput(name: string, kind: string, settings: InputSettings, inputs: OBSResponseTypes['GetInputList']['inputs']) {
    const existing = inputs.find(input => input.inputName === name);
    if (existing && existing.inputKind !== kind) throw new ValidationError(`内置来源 ${name} 类型发生变化，请检查引擎配置`);
    if (!existing) await this.call('CreateInput', { sceneName: engineScene, inputName: name, inputKind: kind, inputSettings: settings, sceneItemEnabled: true });
    else {
      await this.call('SetInputSettings', { inputName: name, inputSettings: settings, overlay: true });
      const items = await this.call('GetSceneItemList', { sceneName: engineScene });
      const item = items.sceneItems.find(item => item.sourceName === name);
      if (!item) await this.call('CreateSceneItem', { sceneName: engineScene, sourceName: name, sceneItemEnabled: true });
      else await this.call('SetSceneItemEnabled', { sceneName: engineScene, sceneItemId: Number(item.sceneItemId), sceneItemEnabled: true });
    }
  }
  private async configureSources(input: unknown) {
    const body = record(input);
    for (const key of ['gameWindow', 'desktopDevice', 'micDevice'] as const) {
      if (body[key] !== undefined && (typeof body[key] !== 'string' || (body[key] as string).length > 1024 || /[\u0000-\u001f\u007f]/.test(body[key] as string))) throw new ValidationError('窗口或音频设备选择无效');
      if (key !== 'gameWindow' && body[key] === '') throw new ValidationError('请选择音频设备，或使用系统默认设备');
    }
    if (body.micEnabled !== undefined && typeof body.micEnabled !== 'boolean') throw new ValidationError('麦克风开关无效');
    if (body.outputFps !== undefined && body.outputFps !== 30 && body.outputFps !== 60) throw new ValidationError('输出帧率需为 30 或 60');
    await this.requireStopped();
    const scenes = await this.call('GetSceneList');
    if (!scenes.scenes.some(scene => scene.sceneName === engineScene)) await this.call('CreateScene', { sceneName: engineScene });
    const profile = await this.call('GetProfileParameter', { parameterCategory: 'SimpleOutput', parameterName: 'StreamEncoder' });
    const encoder = typeof profile.parameterValue === 'string' ? profile.parameterValue : 'x264';
    const fps = ['nvenc', 'amd', 'qsv'].includes(encoder) ? (body.outputFps ?? this.selection.outputFps ?? 60) as 30 | 60 : 30;
    await this.call('SetVideoSettings', { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080, fpsNumerator: fps, fpsDenominator: 1 });
    this.videoSettings = { fps, encoder };
    this.performanceMonitor.reset(); this.previewCache = undefined; this.livePreviewPrepared = false;
    const { inputs } = await this.call('GetInputList');
    await this.ensureInput(gameInput, 'game_capture', { capture_mode: 'window', window: this.selection.gameWindow, priority: 2, capture_cursor: false, anti_cheat_hook: true, limit_framerate: true }, inputs);
    await this.ensureInput(desktopInput, 'wasapi_output_capture', { device_id: this.selection.desktopDevice, use_device_timing: false }, inputs);
    await this.ensureInput(micInput, 'wasapi_input_capture', { device_id: this.selection.micDevice, use_device_timing: false }, inputs);
    await this.ensureInput(hudInput, 'browser_source', { url: this.options.overlayUrl, width: 1920, height: 1080, fps, fps_custom: true, css: 'body { background: rgba(0,0,0,0); margin: 0; overflow: hidden; }', reroute_audio: false, shutdown: false, restart_when_active: false }, inputs);
    this.capabilities = { gameWindows: await this.choices(gameInput, 'window'), audioOutputs: await this.choices(desktopInput, 'device_id'), audioInputs: await this.choices(micInput, 'device_id') };
    const next = { ...this.selection };
    for (const [key, choices] of [['gameWindow', this.capabilities.gameWindows], ['desktopDevice', this.capabilities.audioOutputs], ['micDevice', this.capabilities.audioInputs]] as const) {
      if (body[key] !== undefined) {
        const value = str(body[key], 1024);
        const allowedDefault = key === 'gameWindow' ? value === '' : value === 'default';
        if (!allowedDefault && !choices.some(choice => choice.value === value)) throw new ValidationError('选择的窗口或音频设备已不可用，请刷新后重试');
        next[key] = value;
      }
    }
    if (body.micEnabled !== undefined) next.micEnabled = body.micEnabled as boolean;
    if (body.outputFps !== undefined) next.outputFps = body.outputFps as 30 | 60;
    if (!next.gameWindow) {
      const league = this.capabilities.gameWindows.find(choice => isLeagueWindow(choice.value));
      if (league) next.gameWindow = league.value;
    }
    await this.call('SetInputSettings', { inputName: gameInput, inputSettings: { capture_mode: 'window', window: next.gameWindow, priority: 2 }, overlay: true });
    await this.call('SetInputSettings', { inputName: desktopInput, inputSettings: { device_id: next.desktopDevice }, overlay: true });
    await this.call('SetInputSettings', { inputName: micInput, inputSettings: { device_id: next.micDevice }, overlay: true });
    await this.call('SetInputMute', { inputName: micInput, inputMuted: !next.micEnabled });
    // Mute actual global inputs, including renamed devices, to prevent double capture.
    const special = await this.call('GetSpecialInputs');
    for (const inputName of Object.values(special)) if (typeof inputName === 'string' && inputName && ![gameInput, desktopInput, micInput, hudInput].includes(inputName)) await this.call('SetInputMute', { inputName, inputMuted: true });
    const items = await this.call('GetSceneItemList', { sceneName: engineScene });
    const game = items.sceneItems.find(item => item.sourceName === gameInput);
    const hud = items.sceneItems.find(item => item.sourceName === hudInput);
    if (game) { await this.call('SetSceneItemIndex', { sceneName: engineScene, sceneItemId: Number(game.sceneItemId), sceneItemIndex: 0 }); await this.call('SetSceneItemTransform', { sceneName: engineScene, sceneItemId: Number(game.sceneItemId), sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1920, boundsHeight: 1080, boundsAlignment: 0 } }); }
    if (hud) { await this.call('SetSceneItemIndex', { sceneName: engineScene, sceneItemId: Number(hud.sceneItemId), sceneItemIndex: items.sceneItems.length - 1 }); await this.call('SetSceneItemTransform', { sceneName: engineScene, sceneItemId: Number(hud.sceneItemId), sceneItemTransform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, alignment: 5, boundsType: 'OBS_BOUNDS_NONE' } }); }
    await this.call('SetCurrentProgramScene', { sceneName: engineScene });
    this.selection = next;
    await this.save();
  }
  private beginWindowRefresh() {
    if (this.windowTimer) return;
    this.windowTimer = setInterval(() => {
      if (this.closing || this.mode !== 'embedded' || !this.connected || this.busy || this.starting || this.windowPolling) return;
      this.windowPolling = this.exclusive(() => this.refreshGameWindow()).catch(() => {}).finally(() => { this.windowPolling = undefined; });
    }, 5000);
    this.windowTimer.unref();
  }
  private endWindowRefresh() {
    if (this.windowTimer) clearInterval(this.windowTimer);
    this.windowTimer = undefined;
  }
  private async refreshGameWindow() {
    if (this.closing || this.mode !== 'embedded' || !this.connected) return;
    const windows = await this.choices(gameInput, 'window');
    this.capabilities.gameWindows = windows;
    // A user-selected target is stable; OBS matches its executable if the title changes.
    if (this.selection.gameWindow) return;
    const league = windows.find(choice => isLeagueWindow(choice.value));
    if (!league || this.closing || !this.connected) return;
    await this.call('SetInputSettings', { inputName: gameInput, inputSettings: { capture_mode: 'window', window: league.value, priority: 2 }, overlay: true });
    this.selection.gameWindow = league.value;
    await this.save();
  }
  async setup(input: unknown) {
    if (this.mode !== 'embedded' || !this.connected) throw new ValidationError('请先启动内置 OBS 引擎');
    await this.exclusive(() => this.configureSources(input));
    return this.status();
  }
  async setPreviewCadence(fps:1|30) {
    if(this.previewFps===fps)return;this.previewFps=fps;
    if(!this.connected)return;
    await this.exclusive(async()=>{const inputs=await this.call('GetInputList');if(inputs.inputs.some(i=>i.inputName===previewHudInput))await this.call('SetInputSettings',{inputName:previewHudInput,inputSettings:{fps,fps_custom:true},overlay:true});});
  }
  async preview() {
    if (!this.connected) throw new ValidationError('输出引擎尚未连接');
    const lifetime = this.outputActive ? 5000 : 1500;
    if (this.previewCache && Date.now() - this.previewCache.capturedAt < lifetime) return this.previewCache;
    if (this.previewPending) return this.previewPending;
    this.previewPending = this.capturePreview(lifetime);
    try { return await this.previewPending; } finally { this.previewPending = undefined; }
  }
  /** Native OBS display buses for desktop video capture. No per-frame screenshot RPC. */
  async monitor(input: unknown) {
    const { kind, open } = record(input);
    if (kind !== 'preview' && kind !== 'program') throw new ValidationError('实时监视器类型无效');
    if (open !== undefined && typeof open !== 'boolean') throw new ValidationError('投影窗口选项无效');
    if (this.mode !== 'embedded' || !isRunning(this.child) || !this.connected || this.closing) throw new ValidationError('连续视频监视器需要已连接的内置 OBS 引擎');
    return this.exclusive(async () => {
      const generation = this.connectionGeneration;
      if (kind === 'preview' && !this.livePreviewPrepared) await this.prepareLivePreview(generation);
      if (open !== false) await this.monitorCall(generation, 'OpenVideoMixProjector', { videoMixType: kind === 'program' ? 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM' : 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PREVIEW', monitorIndex: -1 });
      return { projectorTitle: kind === 'program' ? '投影 - 输出' : '投影 - 预览', projectorTitles: kind === 'program' ? ['投影 - 输出', 'Projector - Program'] : ['投影 - 预览', 'Projector - Preview'], obsProcessId: this.child!.pid, fps: this.videoSettings?.fps ?? this.selection.outputFps ?? 60 };
    });
  }
  /** Continuous monitor frames, independent of the low-frequency diagnostic snapshot cache. */
  async liveFrame(kind: 'preview' | 'program'): Promise<Buffer> {
    // OBS screenshots read back GPU pixels. Serialize both monitors to bound that load.
    const pending = this.liveCapture.catch(() => {}).then(async () => {
      if (!this.connected || this.closing) throw new ValidationError('输出引擎尚未连接');
      if (this.busy || this.starting || this.stopping) throw new ValidationError('引擎正在应用设置，实时预览稍后自动恢复');
      const generation = this.connectionGeneration;
      let sourceName: string;
      if (kind === 'preview' && this.mode === 'embedded') {
        if (!this.livePreviewPrepared) {
          this.livePreviewPreparing ??= this.prepareLivePreview(generation);
          try { await this.livePreviewPreparing; } finally { this.livePreviewPreparing = undefined; }
        }
        sourceName = enginePreviewScene;
      } else if (kind === 'preview') {
        if (!(await this.monitorCall(generation, 'GetStudioModeEnabled')).studioModeEnabled) throw new ValidationError('请在外部 OBS 开启工作室模式以查看独立预监');
        sourceName = (await this.monitorCall(generation, 'GetCurrentPreviewScene')).sceneName;
      } else {
        this.liveProgramScene ??= (await this.monitorCall(generation, 'GetCurrentProgramScene')).sceneName;
        sourceName = this.liveProgramScene;
      }
      const screenshot = await this.monitorCall(generation, 'GetSourceScreenshot', { sourceName, imageFormat: 'jpg', imageWidth: 960, imageHeight: 540, imageCompressionQuality: 70 });
      if (!/^data:image\/jpe?g;base64,[A-Za-z0-9+/=]+$/.test(screenshot.imageData) || screenshot.imageData.length > 2 * 1024 * 1024) throw new Error('OBS 返回了无效预览画面');
      const pixels = Buffer.from(screenshot.imageData.slice(screenshot.imageData.indexOf(',') + 1), 'base64');
      if (pixels.length < 4 || pixels[0] !== 0xff || pixels[1] !== 0xd8 || pixels[pixels.length - 2] !== 0xff || pixels[pixels.length - 1] !== 0xd9) throw new Error('OBS 返回了无效预览画面');
      return pixels;
    });
    this.liveCapture = pending;
    return pending;
  }
  private async monitorCall<T extends keyof OBSRequestTypes>(generation: number, request: T, data?: OBSRequestTypes[T]): Promise<OBSResponseTypes[T]> {
    const check = () => { if (!this.connected || this.closing || generation !== this.connectionGeneration) throw new ValidationError('引擎连接已变化，实时预览正在重新连接'); };
    check(); const result = await this.call(request, data); check(); return result;
  }
  private async prepareLivePreview(generation: number) {
    // Create a visual-only scene. The game capture is shared; audio stays in the program.
    // Never change the program scene, streaming, recording or the game's native HUD here.
    const { inputs } = await this.monitorCall(generation, 'GetInputList');
    if (!inputs.some(input => input.inputName === gameInput && input.inputKind === 'game_capture')) throw new ValidationError('游戏来源尚未配置，请先应用内置引擎画面设置');
    const existingHud = inputs.find(input => input.inputName === previewHudInput);
    if (existingHud && existingHud.inputKind !== 'browser_source') throw new ValidationError('预监 HUD 来源类型冲突，请检查内置引擎配置');
    const url = new URL(this.options.overlayUrl); url.searchParams.set('preview', '1');
    // Keep the owned preview HUD at the same cadence as its sampled monitor.
    const settings = { url: url.href, width: 1920, height: 1080, fps: this.previewFps, fps_custom: true, css: 'body { background: rgba(0,0,0,0); margin: 0; overflow: hidden; }', reroute_audio: false, shutdown: false, restart_when_active: false };
    const { scenes } = await this.monitorCall(generation, 'GetSceneList');
    if (!scenes.some(scene => scene.sceneName === enginePreviewScene)) await this.monitorCall(generation, 'CreateScene', { sceneName: enginePreviewScene });
    let { sceneItems } = await this.monitorCall(generation, 'GetSceneItemList', { sceneName: enginePreviewScene });
    let game = sceneItems.find(item => item.sourceName === gameInput);
    if (!game) game = { sourceName: gameInput, ...(await this.monitorCall(generation, 'CreateSceneItem', { sceneName: enginePreviewScene, sourceName: gameInput, sceneItemEnabled: true })) } as typeof sceneItems[number];
    if (!existingHud) await this.monitorCall(generation, 'CreateInput', { sceneName: enginePreviewScene, inputName: previewHudInput, inputKind: 'browser_source', inputSettings: settings, sceneItemEnabled: true });
    else {
      await this.monitorCall(generation, 'SetInputSettings', { inputName: previewHudInput, inputSettings: settings, overlay: true });
      if (!sceneItems.some(item => item.sourceName === previewHudInput)) await this.monitorCall(generation, 'CreateSceneItem', { sceneName: enginePreviewScene, sourceName: previewHudInput, sceneItemEnabled: true });
    }
    sceneItems = (await this.monitorCall(generation, 'GetSceneItemList', { sceneName: enginePreviewScene })).sceneItems;
    const hud = sceneItems.find(item => item.sourceName === previewHudInput);
    await this.monitorCall(generation, 'SetSceneItemEnabled', { sceneName: enginePreviewScene, sceneItemId: Number(game.sceneItemId), sceneItemEnabled: true });
    await this.monitorCall(generation, 'SetSceneItemIndex', { sceneName: enginePreviewScene, sceneItemId: Number(game.sceneItemId), sceneItemIndex: 0 });
    await this.monitorCall(generation, 'SetSceneItemTransform', { sceneName: enginePreviewScene, sceneItemId: Number(game.sceneItemId), sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1920, boundsHeight: 1080, boundsAlignment: 0 } });
    if (hud) {
      await this.monitorCall(generation, 'SetSceneItemEnabled', { sceneName: enginePreviewScene, sceneItemId: Number(hud.sceneItemId), sceneItemEnabled: true });
      await this.monitorCall(generation, 'SetSceneItemIndex', { sceneName: enginePreviewScene, sceneItemId: Number(hud.sceneItemId), sceneItemIndex: sceneItems.length - 1 });
      await this.monitorCall(generation, 'SetSceneItemTransform', { sceneName: enginePreviewScene, sceneItemId: Number(hud.sceneItemId), sceneItemTransform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, alignment: 5, boundsType: 'OBS_BOUNDS_NONE' } });
    }
    // OBS only ticks and renders a browser source when its scene is active/showing.
    // Put this owned scene on the studio preview bus so screenshots contain moving HUD pixels.
    if (!(await this.monitorCall(generation, 'GetStudioModeEnabled')).studioModeEnabled) await this.monitorCall(generation, 'SetStudioModeEnabled', { studioModeEnabled: true });
    await this.monitorCall(generation, 'SetCurrentPreviewScene', { sceneName: enginePreviewScene });
    this.livePreviewPrepared = true;
  }
  private async capturePreview(nextRefreshMs: number) {
    const scene = (await this.call('GetSceneList')).currentProgramSceneName;
    const screenshot = await this.call('GetSourceScreenshot', { sourceName: scene, imageFormat: 'jpg', imageWidth: this.outputActive ? 640 : 960, imageHeight: this.outputActive ? 360 : 540, imageCompressionQuality: this.outputActive ? 55 : 70 });
    if (!/^data:image\/jpe?g;base64,/.test(screenshot.imageData) || screenshot.imageData.length > 2 * 1024 * 1024) throw new Error('OBS 返回了无效预览画面');
    this.previewCache = { imageData: screenshot.imageData, capturedAt: Date.now(), nextRefreshMs };
    return this.previewCache;
  }
  /** Sample the original game source at its own resolution, before any broadcast HUD. */
  async spectatorFrame():Promise<Buffer> {
    if(this.mode!=='embedded'||!this.connected||this.closing||this.busy||this.starting)throw new ValidationError('内置游戏捕获尚未就绪');
    if(!isLeagueWindow(this.selection.gameWindow))throw new ValidationError('当前游戏捕获未绑定英雄联盟进程');
    const generation=this.connectionGeneration;
    const capture=this.liveCapture.catch(()=>{}).then(async()=>{
      const input=await this.monitorCall(generation,'GetInputSettings',{inputName:gameInput});
      if(input.inputKind!=='game_capture'||!isLeagueWindow(String(input.inputSettings?.window??'')))throw new ValidationError('游戏来源未绑定英雄联盟进程');
      const screenshot=await this.monitorCall(generation,'GetSourceScreenshot',{sourceName:gameInput,imageFormat:'png',imageCompressionQuality:80});
      if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(screenshot.imageData)||screenshot.imageData.length>16*1024*1024)throw new Error('游戏捕获原图无效');
      const pixels=Buffer.from(screenshot.imageData.slice(screenshot.imageData.indexOf(',')+1),'base64');
      if(!pixels.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('游戏捕获原图格式无效');
      return pixels;
    });
    this.liveCapture=capture.catch(()=>{});return capture;
  }
  async output(input: unknown) {
    if (!this.connected) throw new ValidationError('输出引擎尚未连接');
    const action = record(input).action;
    await this.exclusive(async () => {
      if (action === 'start-stream') { await this.call('StartStream'); await this.waitOutput('stream', true); }
      else if (action === 'stop-stream') { await this.call('StopStream'); await this.waitOutput('stream', false); }
      else if (action === 'start-record') { await this.call('StartRecord'); await this.waitOutput('record', true); }
      else if (action === 'stop-record') { const result=await this.call('StopRecord');this.recordingPath=result.outputPath; await this.waitOutput('record', false); }
      else throw new ValidationError('输出操作无效');
    });
    return this.status();
  }
  private async waitOutput(kind: 'stream' | 'record', active: boolean) {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const state = kind === 'stream' ? await this.call('GetStreamStatus') : await this.call('GetRecordStatus');
      const reconnecting = kind === 'stream' && 'outputReconnecting' in state && state.outputReconnecting === true;
      if (typeof state.outputActive !== 'boolean') throw new Error('输出引擎未返回有效状态');
      if (active ? state.outputActive : !state.outputActive && !reconnecting) return;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(active ? '输出尚未启动，请检查推流地址、编码器或录制路径后重试' : '输出尚未停止，请在引擎窗口确认后重试');
  }
  private async stopOwnedProcess() {
    if (this.stopping) return this.stopping;
    this.stopping = this.stopProcess();
    try { await this.stopping; } finally { this.stopping = undefined; }
  }
  private async requestProcessClose(child: ChildProcess) {
    if (!child.pid || !isRunning(child)) return;
    try { await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$p = Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if ($p) { $null = $p.CloseMainWindow() }`], { windowsHide: true, timeout: 2000 }); } catch { /* Only our exact ChildProcess is used for fallback termination. */ }
  }
  private async waitProcessExit(child: ChildProcess, milliseconds: number) {
    if (!isRunning(child)) return;
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); child.removeListener('exit', done); resolve(); };
      const timer = setTimeout(done, milliseconds);
      child.once('exit', done);
      if (!isRunning(child)) done();
    });
  }
  private async stopProcess() {
    const child = this.child;
    if (!child) { await this.releaseLock(); return; }
    this.endWindowRefresh();
    if (isRunning(child) && child.pid) {
      await this.requestProcessClose(child);
      await this.waitProcessExit(child, 2500);
      if (isRunning(child)) { try { child.kill(); } catch { /* Retain ownership if termination fails. */ } await this.waitProcessExit(child, 1000); }
    }
    if (!isRunning(child) || !child.pid) {
      if (this.child === child) { this.child = undefined; this.endpoint = undefined; }
      await this.releaseLock();
    } else throw new Error('内置 OBS 进程尚未退出，请在引擎窗口停止输出并关闭后重试');
  }
  async close() {
    this.closing = true;
    await this.liveCapture.catch(() => {});
    this.endWindowRefresh();
    if (this.starting) await this.starting.catch(() => {});
    if (this.operation) await this.operation.catch(() => {});
    if (this.windowPolling) await this.windowPolling;
    if (this.mode === 'embedded' && this.connected) {
      const stream = await this.call('GetStreamStatus').catch(() => null);
      if (stream?.outputActive || stream?.outputReconnecting) { await this.call('StopStream').catch(() => {}); await this.waitOutput('stream', false).catch(() => {}); }
      const recording = await this.call('GetRecordStatus').catch(() => null);
      if (recording?.outputActive) { await this.call('StopRecord').catch(() => {}); await this.waitOutput('record', false).catch(() => {}); }
    }
    await this.obs.disconnect().catch(() => {});
    await this.stopOwnedProcess();
  }
}
