import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Film, Mic, Monitor, Play, Radio, RefreshCw, Save, Send, Square, Volume2 } from 'lucide-react';
import { api } from '../lib';
import { ObsLivePreview, type ObsPreviewStatus } from './ObsLivePreview';
import './embedded-obs.css';

type DeviceOption = { name: string; value: string };
export type ObsEngineStatus = {
  mode: 'embedded' | 'external'; available: boolean; running: boolean; connected: boolean; version: string; error?: string;
  streamActive: boolean; recordActive: boolean; sceneName: string;
  inputs: { inputName: string; inputKind: string; inputMuted?: boolean }[];
  capabilities?: { gameWindows: DeviceOption[]; audioOutputs: DeviceOption[]; audioInputs: DeviceOption[] };
  selection?: { gameWindow: string; desktopDevice: string; micDevice: string; micEnabled: boolean; outputFps?: 30 | 60 };
  performance?: { available: boolean; configuredFps: number; encoder: string; hardwareEncoding: boolean; activeFps: number; cpuUsage: number; renderTimeMs: number; sampleSeconds: number; rendering: { frames: number; percent: number }; encoding: { frames: number; percent: number }; network: { frames: number; percent: number; congestion: number; bitrateKbps: number; reconnecting: boolean }; issues: string[] };
};
type Props = {
  notify: (message: string) => void; onStatus: (status: ObsEngineStatus) => void;
  onOpenStudio?: () => void; onConnectExternal?: () => Promise<void>;
  outputReady?: boolean; onOutputReady?: (ready: boolean) => void; connectionBusy?: boolean;
};
type OutputAction = 'start-stream' | 'stop-stream' | 'start-record' | 'stop-record';
const messageOf = (error: unknown) => error instanceof Error ? error.message : '无法连接直播引擎，请重试';
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function EmbeddedObs({ notify, onStatus, onOpenStudio, onConnectExternal, outputReady = false, onOutputReady, connectionBusy = false }: Props) {
  const [status, setStatus] = useState<ObsEngineStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [operationError, setOperationError] = useState('');
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
  const selectionDirty = useRef(false);
  const operationInProgress = useRef(false);
  const statusGeneration = useRef(0);
  const readinessCallback = useRef(onOutputReady);
  readinessCallback.current = onOutputReady;
  const local = isLocal();
  useEffect(() => { setDestinationApplied(outputReady); }, [outputReady]);
  const invalidateDestination = useCallback(() => { setDestinationApplied(false); readinessCallback.current?.(false); }, []);
  const publishStatus = useCallback((next: ObsEngineStatus, appliedSelection = false) => {
    setStatus(next); setStatusError('');
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
      if (fetching || operationInProgress.current) return; fetching = true;
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
    if (!beginOperation(key)) return; setOperationError('');
    try { publishStatus(await api<ObsEngineStatus>(endpoint, { method: 'POST', body: JSON.stringify(body) }), key === 'setup'); notify(message); }
    catch (error) { const text = messageOf(error); setOperationError(text); notify(text); }
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
      notify('推流接收地址已应用。返回导播台核对节目画面，再开始推流');
    } catch (error) { invalidateDestination(); setOperationError(messageOf(error)); }
    finally { finishOperation(); }
  }
  function output(action: OutputAction) {
    const messages: Record<OutputAction, string> = {
      'start-stream': '引擎已确认开始推流，请在直播应用和直播间核对音画', 'stop-stream': '引擎已确认推流停止',
      'start-record': '引擎已确认开始本机录制', 'stop-record': '引擎已确认录制停止',
    };
    return run(action, '/api/obs/engine/output', { action }, messages[action]);
  }
  function editSelection(work: () => void) { selectionDirty.current = true; work(); }
  const mode = status?.mode ?? 'embedded'; const busy = pending !== null || connectionBusy;
  const connected = !!status?.connected && !statusError;
  const activeOutput = !!status?.streamActive || !!status?.recordActive;
  const sourcesLoaded = connected && !!status?.inputs.length;
  const dirty = mode === 'embedded' && selectionDirty.current;
  const canConfigure = connected && local && !busy && !activeOutput;
  const canOutput = connected && local && !busy;
  const label = statusError ? '状态查询失败' : !status ? '正在读取引擎状态' : status.connected ? '引擎已连接' : status.running ? '正在连接引擎' : mode === 'external' ? '等待连接 OBS' : status.available ? '等待启动' : '内置引擎未就绪';
  const options = status?.capabilities; const performance = status?.performance;
  const encoderLabel = performance ? ({ nvenc: 'NVIDIA NVENC', amd: 'AMD 硬件编码', qsv: 'Intel QSV', x264: 'x264 软件编码' }[performance.encoder] ?? performance.encoder) : '';

  return <section id="obs-setup" className="panel embedded-obs-panel" aria-label="OBS 连接与输出配置">
    <div className="embedded-obs-heading"><div><span className="embedded-obs-eyebrow">OBS · 连接到播出</span><h2>准备直播引擎</h2><p className="muted">连接引擎、选择来源、应用接收地址，完成后进入导播台切换画面。</p></div><span className={`embedded-obs-status ${connected ? 'connected' : ''}`} role="status"><i />{label}</span></div>
    <ol className="embedded-obs-steps" aria-label="OBS 准备进度">
      <li className={connected ? 'complete' : 'current'}><b>{connected ? <Check size={14} /> : '1'}</b><span>连接引擎<small>{connected ? `OBS ${status?.version || ''}` : '启动或连接 OBS'}</small></span></li>
      <li className={sourcesLoaded && !dirty ? 'complete' : connected ? 'current' : ''}><b>{sourcesLoaded && !dirty ? <Check size={14} /> : '2'}</b><span>画面与音频<small>{dirty ? '有设置待应用' : sourcesLoaded ? '来源已加载，核对音画' : '选择游戏和声音来源'}</small></span></li>
      <li className={destinationApplied ? 'complete' : sourcesLoaded ? 'current' : ''}><b>{destinationApplied ? <Check size={14} /> : '3'}</b><span>推流地址<small>{destinationApplied ? '本次配置已应用' : '填写地址与推流码'}</small></span></li>
      <li className={status?.streamActive ? 'complete' : destinationApplied ? 'current' : ''}><b>{status?.streamActive ? <Check size={14} /> : '4'}</b><span>进入导播台<small>{status?.streamActive ? '引擎正在推流' : '核对节目并切入画面'}</small></span></li>
    </ol>
    <div className="embedded-obs-toolbar"><div className="mode-switch" aria-label="选择直播引擎"><button className={mode === 'embedded' ? 'active' : ''} disabled={busy || !local || !status || !!statusError || activeOutput || mode === 'embedded'} onClick={() => void run('mode', '/api/obs/engine/mode', { mode: 'embedded' }, '已切换到内置 OBS 引擎')}><Monitor size={15} />内置 OBS</button><button className={mode === 'external' ? 'active' : ''} disabled={busy || !local || !status || !!statusError || activeOutput || mode === 'external'} onClick={() => void run('mode', '/api/obs/engine/mode', { mode: 'external' }, '已切换到外部 OBS 兼容模式')}>外部 OBS · 高级</button></div><div className="embedded-obs-engine-actions">{mode === 'embedded' && !connected && <button className="button primary small" disabled={busy || !local || !status?.available} onClick={() => void run('start', '/api/obs/engine/start', {}, '内置 OBS 引擎已启动并完成自动配置')}><Play size={14} />{pending === 'start' ? '正在准备…' : '1 · 启动内置引擎'}</button>}{mode === 'external' && !connected && onConnectExternal && <button className="button primary small" disabled={busy || !local} onClick={() => void connectExternal()}><Play size={14} />{pending === 'external-connect' ? '正在连接…' : '连接外部 OBS'}</button>}<button className="button small" disabled={busy} aria-label="刷新直播引擎状态" onClick={() => void refreshStatus()}><RefreshCw size={14} className={pending === 'refresh' ? 'spinning' : ''} />刷新状态</button></div></div>
    <div className="embedded-obs-content">
      <div className="embedded-obs-preview-column"><div className="embedded-obs-section-label"><h3>合成画面核对</h3><span>每秒 1 帧</span></div><div className="embedded-obs-preview"><ObsLivePreview kind="program" purpose="monitor" connected={connected} enabled={previewEnabled} onStatus={setPreviewStatus} /></div><div className="embedded-obs-preview-meta"><span>{status?.sceneName || '等待场景'}</span><span>{previewStatus?.phase === 'live' ? '截图已更新 · 1 FPS' : previewStatus?.message || '等待合成画面'}</span><button type="button" onClick={() => setPreviewEnabled(enabled => !enabled)} disabled={!connected}>{previewEnabled ? '暂停截图' : '恢复截图'}</button></div><p className="muted embedded-obs-note">在比赛或回放中核对游戏捕获，并试听系统声音与麦克风。节目大画面在导播台原生显示。</p>
        {!!status?.inputs.length && <details className="embedded-obs-sources"><summary>已加载来源 · {status.inputs.length}</summary>{status.inputs.map(input => <span key={input.inputName}><LayersIcon kind={input.inputKind} /><span>{input.inputName}</span>{input.inputMuted && <small>静音</small>}</span>)}</details>}
        {performance?.available && <div className="embedded-obs-performance" aria-label="输出流畅性诊断"><div className="embedded-obs-performance-heading"><strong>{performance.activeFps.toFixed(1)} FPS</strong><span>{encoderLabel} · {performance.configuredFps} 帧目标</span></div><div className="embedded-obs-performance-metrics"><span>渲染丢帧 <b>{performance.rendering.percent.toFixed(2)}%</b></span><span>编码丢帧 <b>{performance.encoding.percent.toFixed(2)}%</b></span><span>网络丢帧 <b>{performance.network.percent.toFixed(2)}%</b></span>{status?.streamActive && <span>发送码率 <b>{Math.round(performance.network.bitrateKbps)} kbps</b></span>}</div><p className="muted">OBS 实际输出统计 · {performance.sampleSeconds > 0 ? `最近 ${performance.sampleSeconds.toFixed(1)} 秒` : '正在建立采样基线'}</p>{performance.issues.map(issue => <p className="embedded-obs-performance-issue" key={issue}>{issue}</p>)}</div>}
      </div>
      <div className="embedded-obs-setup-grid"><div className="embedded-obs-configuration">
        {mode === 'embedded' ? <><h3><b>2</b> 游戏画面与音频</h3><label className="field"><span><Monitor size={14} />游戏窗口</span><select aria-label="游戏窗口" value={gameWindow} disabled={!canConfigure} onChange={event => editSelection(() => setGameWindow(event.target.value))}><option value="">自动匹配英雄联盟</option>{options?.gameWindows.map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label><label className="field"><span><Volume2 size={14} />系统声音</span><select aria-label="系统声音" value={desktopDevice} disabled={!canConfigure} onChange={event => editSelection(() => setDesktopDevice(event.target.value))}><option value="default">系统默认输出设备</option>{options?.audioOutputs.filter(option => option.value !== 'default').map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label><label className="toggle-setting"><span>解说麦克风<small>启用后采集选定输入设备</small></span><input aria-label="解说麦克风" type="checkbox" checked={micEnabled} disabled={!canConfigure} onChange={event => editSelection(() => setMicEnabled(event.target.checked))} /></label>{micEnabled && <label className="field"><span><Mic size={14} />麦克风设备</span><select aria-label="麦克风设备" value={micDevice} disabled={!canConfigure} onChange={event => editSelection(() => setMicDevice(event.target.value))}><option value="default">系统默认输入设备</option>{options?.audioInputs.filter(option => option.value !== 'default').map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label>}<label className="field"><span>实际视频输出帧率</span><select aria-label="输出帧率" value={outputFps} disabled={!canConfigure} onChange={event => editSelection(() => setOutputFps(Number(event.target.value) as 30 | 60))}><option value={60}>60 帧 · 优先硬件编码</option><option value={30}>30 帧 · 降低显卡负荷</option></select><small className="muted">软件编码时引擎采用 30 帧，实际帧率见左侧统计。</small></label><button className={`button small ${dirty ? 'primary' : ''}`} disabled={!canConfigure} onClick={() => void run('setup', '/api/obs/engine/setup', { gameWindow, desktopDevice, micDevice, micEnabled, outputFps }, '游戏捕获与音频设置已应用')}><Save size={14} />{pending === 'setup' ? '正在应用…' : dirty ? '应用待保存的来源' : '应用画面与音频'}</button>{activeOutput && <p className="muted embedded-obs-note">停止推流和录制后，可调整来源或切换引擎。</p>}</> : <><h3><b>2</b> 外部 OBS 画面与音频</h3><p className="muted embedded-obs-note">在下方「外部 OBS 连接」中保存服务器设置、选择场景并添加 RiftCast HUD。在 OBS 同一场景准备游戏捕获、系统声音和解说音频。</p><a className="button small" href="#external-obs-setup">打开外部 OBS 连接<ArrowRight size={14} /></a></>}
      </div><div className="embedded-obs-configuration embedded-obs-destination"><h3><b>3</b> 直播平台接收地址</h3><p className="muted embedded-obs-note">使用直播姬第三方模式或平台提供的本次 RTMP 信息。</p><label className="field"><span>RTMP 服务器</span><input aria-label="RTMP 服务器" type="url" maxLength={2048} spellCheck={false} value={server} disabled={!canConfigure} onChange={event => { setServer(event.target.value); invalidateDestination(); }} placeholder="rtmp://主机/应用" /></label><label className="field"><span>推流码</span><input aria-label="推流码" type="password" autoComplete="new-password" maxLength={1024} value={streamKey} disabled={!canConfigure} onChange={event => { setStreamKey(event.target.value); invalidateDestination(); }} placeholder="从直播应用复制本次推流码" /><small className="muted">应用成功后清空本页推流码。</small></label><button className="button small" disabled={!canConfigure || !server.trim() || !streamKey.trim()} onClick={() => void applyDestination()}><Send size={14} />{pending === 'destination' ? '正在应用…' : '应用推流配置'}</button><p className={destinationApplied ? 'embedded-obs-success' : 'muted embedded-obs-note'} role="status">{destinationApplied ? <><Check size={14} />本次推流地址已应用</> : '尚未确认本次推流地址，开播前请应用。'}</p>
        <div className="embedded-obs-launch"><h3><b>4</b> 节目与输出</h3>{onOpenStudio && <button className="button primary" onClick={onOpenStudio}>进入导播台<ArrowRight size={16} /></button>}<p className="muted embedded-obs-note">先核对节目、预监并完成切入，再开始推流。录制可独立启动。</p><div className="embedded-obs-output-actions"><button className={`button small ${status?.streamActive ? 'embedded-obs-stop' : ''}`} disabled={!canOutput || (!status?.streamActive && (!destinationApplied || !sourcesLoaded || dirty))} onClick={() => void output(status?.streamActive ? 'stop-stream' : 'start-stream')}>{status?.streamActive ? <Square size={14} /> : <Radio size={14} />}{pending === 'start-stream' || pending === 'stop-stream' ? '正在处理…' : status?.streamActive ? '停止推流' : '开始推流'}</button><button className={`button small ${status?.recordActive ? 'embedded-obs-stop' : ''}`} disabled={!canOutput || (!status?.recordActive && (!sourcesLoaded || dirty))} onClick={() => void output(status?.recordActive ? 'stop-record' : 'start-record')}>{status?.recordActive ? <Square size={14} /> : <Film size={14} />}{pending === 'start-record' || pending === 'stop-record' ? '正在处理…' : status?.recordActive ? '停止录制' : '开始录制'}</button></div><div className="embedded-obs-output-state"><span className={connected && status?.streamActive ? 'active' : ''}><i />推流{!connected ? '状态未确认' : status?.streamActive ? '进行中' : '已停止'}</span><span className={connected && status?.recordActive ? 'recording' : ''}><i />录制{!connected ? '状态未确认' : status?.recordActive ? '进行中' : '已停止'}</span></div><p className="muted embedded-obs-note">状态由 OBS 确认；平台音画请在直播应用、直播间核对。</p></div>
      </div></div>
    </div>
    {(statusError || status?.error || operationError) && <div className="embedded-obs-errors">{statusError && <p className="request-error" role="alert">{statusError}</p>}{status?.error && status.error !== statusError && <p className="request-error" role="alert">{status.error}</p>}{operationError && operationError !== status?.error && <p className="request-error" role="alert">{operationError}</p>}</div>}
    {!local && <p className="muted embedded-obs-remote-note">请在导播主机的 localhost 工作台控制引擎与直播输出。</p>}
  </section>;
}
function LayersIcon({ kind }: { kind: string }) { return kind.includes('audio') || kind.includes('wasapi') ? <Volume2 size={13} /> : <Monitor size={13} />; }
