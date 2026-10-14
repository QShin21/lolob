import { OutputPatchbay } from './OutputPatchbay';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Mic, Monitor, Play, RefreshCw, Save, Volume2 } from 'lucide-react';
import { OutputSignals } from './OutputSignals';
import type { OutputAction, OutputDestination, VirtualCameraDriverStatus, CompanionAudioStatus } from '../../shared/obs-output';
import { api } from '../lib';
import { ObsLivePreview, type ObsPreviewStatus } from './ObsLivePreview';
import './embedded-obs.css';

type DeviceOption = { name: string; value: string };
export type ObsEngineStatus = {
  mode: 'embedded' | 'external'; available: boolean; running: boolean; connected: boolean; version: string; error?: string;
  streamActive: boolean; recordActive: boolean; sceneName: string;
  destination?: OutputDestination; virtualCamActive?: boolean | null;
  virtualCamera?: { supported: boolean; driver: VirtualCameraDriverStatus; requiresRestart?: boolean; error?: string };
  companionAudio?: CompanionAudioStatus;
  inputs: { inputName: string; inputKind: string; inputMuted?: boolean }[];
  capabilities?: { gameWindows: DeviceOption[]; audioOutputs: DeviceOption[]; audioInputs: DeviceOption[] };
  selection?: { gameWindow: string; desktopDevice: string; micDevice: string; micEnabled: boolean; outputFps?: 30 | 60 };
  performance?: { available: boolean; configuredFps: number; encoder: string; hardwareEncoding: boolean; activeFps: number; cpuUsage: number; renderTimeMs: number; sampleSeconds: number; rendering: { frames: number; percent: number }; encoding: { frames: number; percent: number }; network: { frames: number; percent: number; congestion: number; bitrateKbps: number; reconnecting: boolean }; issues: string[] };
};
type Props = {
  section?: string; onSection?: (section: 'video' | 'audio' | 'output') => void; controlReason?: string;
  notify: (message: string,kind?:import('../../shared/types').NoticeKind) => void; onStatus: (status: ObsEngineStatus) => void;
  onOpenStudio?: () => void; onConnectExternal?: () => Promise<void>;
  outputReady?: boolean; onOutputReady?: (ready: boolean) => void; connectionBusy?: boolean;
};
const messageOf = (error: unknown) => error instanceof Error ? error.message : '无法连接直播引擎，请重试';
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function EmbeddedObs({ section='video',onSection,controlReason='',notify, onStatus, onOpenStudio, onConnectExternal, outputReady = false, onOutputReady, connectionBusy = false }: Props) {
  const [status, setStatus] = useState<ObsEngineStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [receipt, setReceipt] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<ObsPreviewStatus | null>(null);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [gameWindow, setGameWindow] = useState('');
  const [desktopDevice, setDesktopDevice] = useState('default');
  const [micDevice, setMicDevice] = useState('default');
  const [micEnabled, setMicEnabled] = useState(false);
  const [outputFps, setOutputFps] = useState<30 | 60>(60);
  const [server, setServer] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [destinationApplied, setDestinationApplied] = useState(outputReady);
  const selectionMode = useRef<ObsEngineStatus['mode'] | null>(null);
  const selectionDestination = useRef<OutputDestination | undefined>(undefined);
  const selectionDirty = useRef(false);
  const operationInProgress = useRef(false);
  const statusGeneration = useRef(0);
  const readinessCallback = useRef(onOutputReady);
  readinessCallback.current = onOutputReady;
  const local = isLocal(), surface=useRef<HTMLElement>(null);
  useEffect(() => { setDestinationApplied(outputReady); }, [outputReady]);
  const invalidateDestination = useCallback(() => { setDestinationApplied(false); readinessCallback.current?.(false); }, []);
  const publishStatus = useCallback((next: ObsEngineStatus, appliedSelection = false) => {
    setStatus(next); setStatusError('');
    if (selectionDestination.current && selectionDestination.current !== next.destination) invalidateDestination();
    selectionDestination.current = next.destination;
    if (!next.connected || (selectionMode.current && selectionMode.current !== next.mode)) {
      invalidateDestination(); setStreamKey('');
    }
    if (next.selection && (appliedSelection || selectionMode.current !== next.mode || !selectionDirty.current)) {
      setGameWindow(next.selection.gameWindow); setDesktopDevice(next.selection.desktopDevice);
      setMicDevice(next.selection.micDevice); setMicEnabled(next.selection.micEnabled);
      setOutputFps(next.selection.outputFps ?? 60); selectionDirty.current = false;
    }
    selectionMode.current = next.mode; onStatus(next);
  }, [onStatus, invalidateDestination]);

  useEffect(() => {
    let active = true; let fetching = false;
    async function refresh() {
      if (fetching || document.hidden || surface.current?.closest('[hidden]') || operationInProgress.current) return; fetching = true;
      const generation = statusGeneration.current;
      try { const result = await api<ObsEngineStatus>('/api/obs/engine'); if (active && generation === statusGeneration.current) publishStatus(result); }
      catch (error) { if (active && generation === statusGeneration.current) { setStatusError(messageOf(error)); invalidateDestination(); } }
      finally { fetching = false; }
    }
    void refresh(); const timer = window.setInterval(() => void refresh(), 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [publishStatus, invalidateDestination]);

  function beginOperation(key: string) {
    if (operationInProgress.current) return false;
    operationInProgress.current = true; statusGeneration.current += 1;
    setPending(key); return true;
  }
  function finishOperation() { operationInProgress.current = false; setPending(null); }

  async function run(key: string, endpoint: string, body: Record<string, unknown>, message: string) {
    if (!beginOperation(key)) return; setOperationError(''); setReceipt('');
    try { publishStatus(await api<ObsEngineStatus>(endpoint, { method: 'POST', body: JSON.stringify(body) }), key === 'setup'); setReceipt(message); notify(message); }
    catch (error) { const text = messageOf(error); setOperationError(text); notify(text,'error'); }
    finally { finishOperation(); }
  }
  async function refreshStatus() {
    if (!beginOperation('refresh')) return;
    try { publishStatus(await api<ObsEngineStatus>('/api/obs/engine')); }
    catch (error) { setStatusError(messageOf(error)); invalidateDestination(); }
    finally { finishOperation(); }
  }
  async function connectExternal() {
    if (!onConnectExternal || !beginOperation('external-connect')) return;
    setOperationError('');
    try { await onConnectExternal(); publishStatus(await api<ObsEngineStatus>('/api/obs/engine')); }
    catch (error) { setOperationError(messageOf(error)); invalidateDestination(); }
    finally { finishOperation(); }
  }
  async function applyDestination() {
    setOperationError(''); let parsed: URL;
    try { parsed = new URL(server.trim()); }
    catch { setOperationError('请填写直播应用提供的完整 RTMP 接收地址'); return; }
    if (!['rtmp:', 'rtmps:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) {
      setOperationError('接收地址需使用 rtmp:// 或 rtmps://，推流码请填入独立字段'); return;
    }
    if (!streamKey.trim()) { setOperationError('请填写本次直播的推流码'); return; }
    if (!beginOperation('destination')) return;
    try {
      const result = await api<{ applied: boolean }>('/api/obs/stream/settings', { method: 'POST', body: JSON.stringify({ server: server.trim(), key: streamKey.trim() }) });
      if (!result.applied) throw new Error('引擎未确认推流配置，请重新应用');
      setDestinationApplied(true); readinessCallback.current?.(true); setStreamKey('');
      setReceipt('OBS 已确认本次 RTMP 凭据；推流尚需手动启动。');
      notify('推流接收地址已应用。返回导播台核对节目画面，再开始推流');
    } catch (error) { invalidateDestination(); setOperationError(messageOf(error)); }
    finally { finishOperation(); }
  }
  async function output(action: OutputAction) {
    if (!beginOperation(action)) return; setOperationError(''); setReceipt('');
    try {
      const next = await api<ObsEngineStatus>('/api/obs/engine/output', { method: 'POST', body: JSON.stringify({ action }) });
      publishStatus(next);
      const started = action.startsWith('start');
      const confirmed = action.endsWith('virtual-camera')
        ? started ? next.virtualCamActive === true && next.companionAudio?.active === true : next.virtualCamActive === false && next.companionAudio?.active === false && next.companionAudio?.managing === false
        : (action.endsWith('stream') ? next.streamActive : next.recordActive) === started;
      if (!next.connected || !confirmed || next.error || action.endsWith('virtual-camera') && next.companionAudio?.error) throw new Error(next.error || next.companionAudio?.error || '输出尚未完整确认，请核对各路状态');
      const message = action.endsWith('virtual-camera')
        ? started ? '节目视频和最终混音已送出，请在伴侣核对后开播' : '伴侣音画已停止并退出托管；外部直播间请在伴侣结束'
        : 'OBS 已确认' + (started ? '启动' : '停止') + (action.endsWith('stream') ? ' RTMP' : '本机录制');
      setReceipt(message); notify(message);
    } catch (error) {
      const text = messageOf(error); setOperationError(text); notify(text, 'error');
      // A failed start/stop may have rolled back only part of the route. Refresh facts, never retry the write automatically.
      try { publishStatus(await api<ObsEngineStatus>('/api/obs/engine')); }
      catch (refreshError) { setStatusError(messageOf(refreshError)); invalidateDestination(); }
    }
    finally { finishOperation(); }
  }
  function editSelection(work: () => void) { selectionDirty.current = true; work(); }
  const mode = status?.mode ?? 'embedded'; const busy = pending !== null || connectionBusy;
  const connected = !!status?.connected && !statusError;
  const activeOutput = !!status?.streamActive || !!status?.recordActive || status?.virtualCamActive === true || status?.companionAudio?.managing === true || status?.companionAudio?.active === true;
  const destination = status?.destination ?? 'rtmp';
  const cameraStateKnown = mode !== 'embedded' || status?.virtualCamActive != null;
  const sourcesLoaded = connected && !!status?.inputs.length;
  const dirty = mode === 'embedded' && selectionDirty.current;
  const canConfigure = connected && local && !controlReason && !busy && !activeOutput && cameraStateKnown;
  const canOutput = connected && local && !controlReason && !busy;
  const label = statusError ? '状态查询失败' : !status ? '正在读取引擎状态' : status.connected ? '引擎已连接' : status.running ? '正在连接引擎' : mode === 'external' ? '等待连接 OBS' : status.available ? '等待启动' : '内置引擎未就绪';
  const options = status?.capabilities; const performance = status?.performance;
  const encoderLabel = performance ? ({ nvenc: 'NVIDIA NVENC', amd: 'AMD 硬件编码', qsv: 'Intel QSV', x264: 'x264 软件编码' }[performance.encoder] ?? performance.encoder) : '';

  const sourceBlockReason = !local ? '来源配置仅允许在导播主机操作。'
    : controlReason || (!connected ? '先连接 OBS 引擎，再选择来源。'
      : activeOutput ? '停止 RTMP、伴侣音画和录制后，才能调整来源或切换引擎。'
      : !cameraStateKnown ? '虚拟摄像头状态未知，请先刷新状态。' : '');

  return <section ref={surface} id="obs-setup" className="engine-workspace" aria-label="OBS 连接与输出配置">
    <header className="engine-statusbar">
      <div className="engine-identity"><Monitor size={17} /><strong>{mode === 'embedded' ? '内置 OBS' : '外部 OBS'}</strong><span className={connected ? 'is-connected' : 'is-unavailable'} role="status">{label}</span></div>
      <span className="engine-version">{status?.version ? '版本 ' + status.version : '版本待查询'}</span>
      <div className="engine-status-actions">
        {mode === 'embedded' && !connected && <button className="button primary small" disabled={busy || !local || !!controlReason || !status?.available} onClick={() => void run('start', '/api/obs/engine/start', {}, '引擎启动请求已处理，请核对连接与已加载来源')}><Play size={14} />{pending === 'start' ? '正在准备…' : '启动内置引擎'}</button>}
        {mode === 'external' && !connected && onConnectExternal && <button className="button primary small" disabled={busy || !local || !!controlReason} onClick={() => void connectExternal()}><Play size={14} />{pending === 'external-connect' ? '正在连接…' : '连接外部 OBS'}</button>}
        {section !== 'video' && onSection && <button className="button small" onClick={() => onSection('video')}>画面与引擎</button>}
        <button className="button small" disabled={busy} aria-label="刷新直播引擎状态" onClick={() => void refreshStatus()}><RefreshCw size={14} className={pending === 'refresh' ? 'spinning' : ''} />刷新状态</button>
      </div>
    </header>
    {(statusError || status?.error || operationError) && <div className="engine-errors">
      {statusError && <p role="alert">{statusError}。当前输出状态未确认，请刷新连接后核对。</p>}
      {status?.error && status.error !== statusError && <p role="alert">{status.error}</p>}
      {operationError && operationError !== status?.error && <p role="alert">{operationError}</p>}
    </div>}
    {(!local || controlReason) && <p className="engine-access-note">{!local ? '请在导播主机的 localhost 工作台控制引擎与输出。' : controlReason}</p>}

    {section === 'output' ? <OutputPatchbay
      {...{ status, connected, busy, local, activeOutput, canConfigure, canOutput, controlReason, destination, destinationApplied, sourcesLoaded, dirty, pending, receipt, server, streamKey, onOpenStudio, onSection }}
      setServer={value => { setServer(value); invalidateDestination(); }}
      setStreamKey={value => { setStreamKey(value); invalidateDestination(); }}
      selectDestination={value => void run('output-destination', '/api/obs/engine/destination', { destination: value }, '下一次输出路径已保存；当前输出状态请单独核对')}
      applyDestination={() => void applyDestination()}
      output={action => void output(action)}
      prepare={() => void run('prepare-companion', '/api/obs/engine/companion/prepare', {}, '设备准备请求已完成，请核对状态、错误与重启要求')}
      installCamera={() => void run('install-camera', '/api/obs/engine/virtual-camera/install', {}, '摄像头准备请求已完成，请核对驱动注册与重新加载要求')}
    /> : <>
      {section === 'video' && <div className="engine-mode-row">
        <span>引擎模式</span>
        <div role="group" aria-label="选择直播引擎">
          <button aria-pressed={mode === 'embedded'} disabled={busy || !local || !!controlReason || !status || !!statusError || activeOutput || mode === 'embedded'} onClick={() => void run('mode', '/api/obs/engine/mode', { mode: 'embedded' }, '已切换到内置 OBS 引擎')}>内置 OBS</button>
          <button aria-pressed={mode === 'external'} disabled={busy || !local || !!controlReason || !status || !!statusError || activeOutput || mode === 'external'} onClick={() => void run('mode', '/api/obs/engine/mode', { mode: 'external' }, '已切换到外部 OBS 兼容模式')}>外部 OBS</button>
        </div>
        <small>{activeOutput ? '活动输出期间锁定模式' : '切换模式不会自动开播'}</small>
      </div>}
      {section === 'audio' && <div className="engine-audio-route"><div><strong>声音来源到 Program 混音</strong><p>设备配置决定采集来源；下方通道增益、静音与音乐播放立即影响节目声音。</p></div><OutputSignals status={connected ? status : null} /></div>}
      <div className={section === 'video' ? 'engine-source-layout' : 'engine-audio-settings'}>
        {section === 'video' && <div className="engine-preview-column">
          <div className="engine-section-heading"><h3>PGM 合成画面</h3><span>周期快照 / 每秒 1 帧</span></div>
          <div className="engine-preview-surface embedded-obs-preview"><ObsLivePreview kind="program" purpose="monitor" connected={connected} enabled={previewEnabled && section === 'video'} onStatus={setPreviewStatus} /></div>
          <div className="engine-preview-meta"><span>{status?.sceneName || '场景待查询'}</span><button type="button" onClick={() => setPreviewEnabled(value => !value)} disabled={!connected}>{previewEnabled ? '暂停截图' : '恢复截图'}</button></div>
          <p className="engine-note">{previewStatus?.phase === 'live' ? '周期快照已更新；动态合成画面可在导播台核对。' : previewStatus?.message || '等待引擎合成画面。'}</p>
          {!!status?.inputs.length && <details className="engine-loaded-sources"><summary>已加载来源（{status.inputs.length}）</summary>{status.inputs.map(input => <div key={input.inputName}><LayersIcon kind={input.inputKind} /><span>{input.inputName}</span>{input.inputMuted && <small>静音</small>}</div>)}</details>}
        </div>}
        <div className="engine-source-configuration">
          {mode === 'embedded' ? <>
            <div className="engine-section-heading"><h3>{section === 'audio' ? '采集设备' : '游戏画面与声音来源'}</h3><span>{dirty ? '有未应用修改' : '来源配置'}</span></div>
            <div className="engine-source-fields">
              {section === 'video' && <label className="field"><span><Monitor size={14} />游戏窗口</span><select aria-label="游戏窗口" value={gameWindow} disabled={!canConfigure} onChange={event => editSelection(() => setGameWindow(event.target.value))}><option value="">自动匹配英雄联盟</option>{options?.gameWindows.map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label>}
              <label className="field"><span><Volume2 size={14} />系统声音</span><select aria-label="系统声音" value={desktopDevice} disabled={!canConfigure} onChange={event => editSelection(() => setDesktopDevice(event.target.value))}><option value="default">系统默认输出设备</option>{options?.audioOutputs.filter(option => option.value !== 'default').map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select><small>保留原游戏输出，避免采集 CABLE 混音形成反馈。</small></label>
              <label className="engine-mic-toggle"><span>采集解说麦克风<small>使用真实麦克风输入设备</small></span><input aria-label="解说麦克风" type="checkbox" checked={micEnabled} disabled={!canConfigure} onChange={event => editSelection(() => setMicEnabled(event.target.checked))} /></label>
              {micEnabled && <label className="field"><span><Mic size={14} />麦克风设备</span><select aria-label="麦克风设备" value={micDevice} disabled={!canConfigure} onChange={event => editSelection(() => setMicDevice(event.target.value))}><option value="default">系统默认输入设备</option>{options?.audioInputs.filter(option => option.value !== 'default').map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label>}
              {section === 'video' && <label className="field"><span>视频输出目标帧率</span><select aria-label="输出帧率" value={outputFps} disabled={!canConfigure} onChange={event => editSelection(() => setOutputFps(Number(event.target.value) as 30 | 60))}><option value={60}>60 帧 / 优先硬件编码</option><option value={30}>30 帧 / 降低显卡负荷</option></select><small>软件编码时引擎采用 30 帧；实际表现见输出统计。</small></label>}
            </div>
            <div className="engine-source-apply"><p>{sourceBlockReason || '应用来源会更新引擎配置；启动输出仍需单独操作。'}</p><button className={'button small' + (dirty ? ' primary' : '')} disabled={!canConfigure} onClick={() => void run('setup', '/api/obs/engine/setup', { gameWindow, desktopDevice, micDevice, micEnabled, outputFps }, '游戏捕获与音频设置已应用')}><Save size={14} />{pending === 'setup' ? '正在应用…' : dirty ? '应用来源修改' : '应用画面与音频'}</button></div>
          </> : <div className="engine-external-guidance"><h3>外部 OBS 来源</h3><p>在 OBS 的同一场景准备游戏捕获、系统声音与解说音频，再添加 RiftCast HUD 浏览器来源。</p>{section === 'video' ? <button className="button" onClick={() => document.getElementById('external-obs-setup')?.scrollIntoView({ block: 'start', behavior: 'auto' })}>连接与场景设置<ArrowRight size={14} /></button> : <button className="button" onClick={() => onSection?.('video')}>打开外部 OBS 设置</button>}</div>}
          {receipt && <p className="engine-operation-receipt" role="status">{receipt}</p>}
        </div>
      </div>
      {section === 'video' && <details className="engine-performance" open={!!performance?.issues.length}>
        <summary>OBS 输出统计<span>{performance?.available ? performance.activeFps.toFixed(1) + ' FPS / ' + encoderLabel : '等待真实统计'}</span></summary>
        {performance?.available ? <><dl>
          <div><dt>当前 / 目标帧率</dt><dd>{performance.activeFps.toFixed(1)} / {performance.configuredFps} FPS</dd></div>
          <div><dt>渲染丢帧</dt><dd>{performance.rendering.percent.toFixed(2)}%</dd></div>
          <div><dt>编码丢帧</dt><dd>{performance.encoding.percent.toFixed(2)}%</dd></div>
          <div><dt>网络丢帧</dt><dd>{performance.network.percent.toFixed(2)}%</dd></div>
          <div><dt>CPU / 渲染耗时</dt><dd>{performance.cpuUsage.toFixed(1)}% / {performance.renderTimeMs.toFixed(2)} ms</dd></div>
          <div><dt>发送码率</dt><dd>{status?.streamActive ? Math.round(performance.network.bitrateKbps) + ' kbps' : 'RTMP 未运行'}</dd></div>
        </dl><p>{performance.sampleSeconds > 0 ? '最近 ' + performance.sampleSeconds.toFixed(1) + ' 秒的 OBS 统计' : '正在建立采样基线'}；不代表平台接收帧率。</p>{performance.issues.map(issue => <p className="engine-performance-warning" key={issue}>{issue}</p>)}</> : <p>尚未提供输出采样，不能据此判断实际帧率或推流稳定性。</p>}
      </details>}
    </>}
  </section>;
}
function LayersIcon({ kind }: { kind: string }) { return kind.includes('audio') || kind.includes('wasapi') ? <Volume2 size={13} /> : <Monitor size={13} />; }
