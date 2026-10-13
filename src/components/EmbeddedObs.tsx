import { HoldButton } from './ProductionDesk';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Check, Film, Mic, Monitor, Play, Radio, RefreshCw, Save, Send, Square, Volume2 } from 'lucide-react';
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
  section?:string;onSection?:(section:'video'|'audio'|'output')=>void;
  notify: (message: string,kind?:import('../../shared/types').NoticeKind) => void; onStatus: (status: ObsEngineStatus) => void;
  onOpenStudio?: () => void; onConnectExternal?: () => Promise<void>;
  outputReady?: boolean; onOutputReady?: (ready: boolean) => void; connectionBusy?: boolean;
};
const messageOf = (error: unknown) => error instanceof Error ? error.message : '无法连接直播引擎，请重试';
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function EmbeddedObs({ section='video',onSection,notify, onStatus, onOpenStudio, onConnectExternal, outputReady = false, onOutputReady, connectionBusy = false }: Props) {
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
    if (!beginOperation(key)) return; setOperationError('');
    try { publishStatus(await api<ObsEngineStatus>(endpoint, { method: 'POST', body: JSON.stringify(body) }), key === 'setup'); notify(message); }
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
      notify('推流接收地址已应用。返回导播台核对节目画面，再开始推流');
    } catch (error) { invalidateDestination(); setOperationError(messageOf(error)); }
    finally { finishOperation(); }
  }
  function output(action: OutputAction) {
    const messages: Record<OutputAction, string> = {
      'start-stream': '引擎已确认开始推流，请在直播应用和直播间核对音画', 'stop-stream': '引擎已确认推流停止',
      'start-record': '引擎已确认开始本机录制', 'stop-record': '引擎已确认录制停止',
      'start-virtual-camera': '节目画面与完整混音已送出，请在直播伴侣核对音画并开始直播',
      'stop-virtual-camera': '伴侣音画输出已停止；直播间请在直播伴侣中结束直播',
    };
    return run(action, '/api/obs/engine/output', { action }, messages[action]);
  }
  function editSelection(work: () => void) { selectionDirty.current = true; work(); }
  const mode = status?.mode ?? 'embedded'; const busy = pending !== null || connectionBusy;
  const connected = !!status?.connected && !statusError;
  const activeOutput = !!status?.streamActive || !!status?.recordActive || status?.virtualCamActive === true || status?.companionAudio?.managing === true || status?.companionAudio?.active === true;
  const destination = status?.destination ?? 'rtmp';
  const companion = destination === 'douyin';
  const camera = status?.virtualCamera;
  const destinationReady = companion ? !!camera?.driver.installed && !camera?.requiresRestart && !!status?.companionAudio?.ready : destinationApplied;
  const cameraStateKnown = mode !== 'embedded' || status?.virtualCamActive !== null;
  const sourcesLoaded = connected && !!status?.inputs.length;
  const dirty = mode === 'embedded' && selectionDirty.current;
  const canConfigure = connected && local && !busy && !activeOutput && cameraStateKnown;
  const canOutput = connected && local && !busy;
  const label = statusError ? '状态查询失败' : !status ? '正在读取引擎状态' : status.connected ? '引擎已连接' : status.running ? '正在连接引擎' : mode === 'external' ? '等待连接 OBS' : status.available ? '等待启动' : '内置引擎未就绪';
  const options = status?.capabilities; const performance = status?.performance;
  const encoderLabel = performance ? ({ nvenc: 'NVIDIA NVENC', amd: 'AMD 硬件编码', qsv: 'Intel QSV', x264: 'x264 软件编码' }[performance.encoder] ?? performance.encoder) : '';

  return <section ref={surface} id="obs-setup" className={`panel embedded-obs-panel section-${section}`} aria-label="OBS 连接与输出配置">
    <div className="embedded-obs-heading"><div><span className="embedded-obs-eyebrow">OBS · 连接到播出</span><h2>准备直播引擎</h2><p className="muted">连接引擎、选择来源、选择输出方式，完成后进入导播台切换画面。</p></div><span className={`embedded-obs-status ${connected ? 'connected' : ''}`} role="status"><i />{label}</span></div>
    <ol className="embedded-obs-steps" aria-label="OBS 准备进度">
      <li role="button" tabIndex={0} onClick={()=>onSection?.('video')} onKeyDown={e=>{if(e.key==='Enter')onSection?.('video');}} className={connected ? 'complete' : 'current'}><b>{connected ? <Check size={14} /> : '1'}</b><span>连接引擎<small>{connected ? `OBS ${status?.version || ''}` : '启动或连接 OBS'}</small></span></li>
      <li role="button" tabIndex={0} onClick={()=>onSection?.('audio')} onKeyDown={e=>{if(e.key==='Enter')onSection?.('audio');}} className={sourcesLoaded && !dirty ? 'complete' : connected ? 'current' : ''}><b>{sourcesLoaded && !dirty ? <Check size={14} /> : '2'}</b><span>画面与音频<small>{dirty ? '有设置待应用' : sourcesLoaded ? '来源已加载，核对音画' : '选择游戏和声音来源'}</small></span></li>
      <li role="button" tabIndex={0} onClick={()=>onSection?.('output')} onKeyDown={e=>{if(e.key==='Enter')onSection?.('output');}} className={destinationReady ? 'complete' : sourcesLoaded ? 'current' : ''}><b>{destinationReady ? <Check size={14} /> : '3'}</b><span>直播输出方式<small>{companion ? camera?.driver.installed ? '摄像头已就绪' : '准备虚拟摄像头' : destinationApplied ? '本次地址已应用' : '填写地址与推流码'}</small></span></li>
      <li className={status?.streamActive || status?.virtualCamActive ? 'complete' : destinationReady ? 'current' : ''}><b>{status?.streamActive || status?.virtualCamActive ? <Check size={14} /> : '4'}</b><span>进入导播台<small>{companion ? status?.virtualCamActive ? '画面已送出 · 伴侣中开播' : '核对节目后送到伴侣' : status?.streamActive ? '引擎正在推流' : '核对节目并切入画面'}</small></span></li>
    </ol>
    <div className="embedded-obs-toolbar"><div className="mode-switch" aria-label="选择直播引擎"><button className={mode === 'embedded' ? 'active' : ''} disabled={busy || !local || !status || !!statusError || activeOutput || mode === 'embedded'} onClick={() => void run('mode', '/api/obs/engine/mode', { mode: 'embedded' }, '已切换到内置 OBS 引擎')}><Monitor size={15} />内置 OBS</button><button className={mode === 'external' ? 'active' : ''} disabled={busy || !local || !status || !!statusError || activeOutput || mode === 'external'} onClick={() => void run('mode', '/api/obs/engine/mode', { mode: 'external' }, '已切换到外部 OBS 兼容模式')}>外部 OBS · 高级</button></div><div className="embedded-obs-engine-actions">{mode === 'embedded' && !connected && <button className="button primary small" disabled={busy || !local || !status?.available} onClick={() => void run('start', '/api/obs/engine/start', {}, '内置 OBS 引擎已启动并完成自动配置')}><Play size={14} />{pending === 'start' ? '正在准备…' : '1 · 启动内置引擎'}</button>}{mode === 'external' && !connected && onConnectExternal && <button className="button primary small" disabled={busy || !local} onClick={() => void connectExternal()}><Play size={14} />{pending === 'external-connect' ? '正在连接…' : '连接外部 OBS'}</button>}<button className="button small" disabled={busy} aria-label="刷新直播引擎状态" onClick={() => void refreshStatus()}><RefreshCw size={14} className={pending === 'refresh' ? 'spinning' : ''} />刷新状态</button></div></div>
    <div className="embedded-obs-content">
      <div className="embedded-obs-preview-column"><div className="embedded-obs-section-label"><h3>合成画面核对</h3><span>每秒 1 帧</span></div><div className="embedded-obs-preview"><ObsLivePreview kind="program" purpose="monitor" connected={connected} enabled={previewEnabled&&section==='video'} onStatus={setPreviewStatus} /></div><div className="embedded-obs-preview-meta"><span>{status?.sceneName || '等待场景'}</span><span>{previewStatus?.phase === 'live' ? '截图已更新 · 1 FPS' : previewStatus?.message || '等待合成画面'}</span><button type="button" onClick={() => setPreviewEnabled(enabled => !enabled)} disabled={!connected}>{previewEnabled ? '暂停截图' : '恢复截图'}</button></div><p className="muted embedded-obs-note">在比赛或回放中核对游戏捕获，并试听系统声音与麦克风。节目大画面在导播台原生显示。</p>
        {!!status?.inputs.length && <details className="embedded-obs-sources"><summary>已加载来源 · {status.inputs.length}</summary>{status.inputs.map(input => <span key={input.inputName}><LayersIcon kind={input.inputKind} /><span>{input.inputName}</span>{input.inputMuted && <small>静音</small>}</span>)}</details>}
        {performance?.available && <div className="embedded-obs-performance" aria-label="输出流畅性诊断"><div className="embedded-obs-performance-heading"><strong>{performance.activeFps.toFixed(1)} FPS</strong><span>{encoderLabel} · {performance.configuredFps} 帧目标</span></div><div className="embedded-obs-performance-metrics"><span>渲染丢帧 <b>{performance.rendering.percent.toFixed(2)}%</b></span><span>编码丢帧 <b>{performance.encoding.percent.toFixed(2)}%</b></span><span>网络丢帧 <b>{performance.network.percent.toFixed(2)}%</b></span>{status?.streamActive && <span>发送码率 <b>{Math.round(performance.network.bitrateKbps)} kbps</b></span>}</div><p className="muted">OBS 实际输出统计 · {performance.sampleSeconds > 0 ? `最近 ${performance.sampleSeconds.toFixed(1)} 秒` : '正在建立采样基线'}</p>{performance.issues.map(issue => <p className="embedded-obs-performance-issue" key={issue}>{issue}</p>)}</div>}
      </div>
      <div className="embedded-obs-setup-grid"><div className="embedded-obs-configuration">
        {mode === 'embedded' ? <><h3><b>2</b> 游戏画面与音频</h3><label className="field"><span><Monitor size={14} />游戏窗口</span><select aria-label="游戏窗口" value={gameWindow} disabled={!canConfigure} onChange={event => editSelection(() => setGameWindow(event.target.value))}><option value="">自动匹配英雄联盟</option>{options?.gameWindows.map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label><label className="field"><span><Volume2 size={14} />系统声音</span><select aria-label="系统声音" value={desktopDevice} disabled={!canConfigure} onChange={event => editSelection(() => setDesktopDevice(event.target.value))}><option value="default">系统默认输出设备</option>{options?.audioOutputs.filter(option => option.value !== 'default').map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label><label className="toggle-setting"><span>解说麦克风<small>启用后采集选定输入设备</small></span><input aria-label="解说麦克风" type="checkbox" checked={micEnabled} disabled={!canConfigure} onChange={event => editSelection(() => setMicEnabled(event.target.checked))} /></label>{micEnabled && <label className="field"><span><Mic size={14} />麦克风设备</span><select aria-label="麦克风设备" value={micDevice} disabled={!canConfigure} onChange={event => editSelection(() => setMicDevice(event.target.value))}><option value="default">系统默认输入设备</option>{options?.audioInputs.filter(option => option.value !== 'default').map(option => <option key={option.value} value={option.value}>{option.name}</option>)}</select></label>}<label className="field"><span>实际视频输出帧率</span><select aria-label="输出帧率" value={outputFps} disabled={!canConfigure} onChange={event => editSelection(() => setOutputFps(Number(event.target.value) as 30 | 60))}><option value={60}>60 帧 · 优先硬件编码</option><option value={30}>30 帧 · 降低显卡负荷</option></select><small className="muted">软件编码时引擎采用 30 帧，实际帧率见左侧统计。</small></label><button className={`button small ${dirty ? 'primary' : ''}`} disabled={!canConfigure} onClick={() => void run('setup', '/api/obs/engine/setup', { gameWindow, desktopDevice, micDevice, micEnabled, outputFps }, '游戏捕获与音频设置已应用')}><Save size={14} />{pending === 'setup' ? '正在应用…' : dirty ? '应用待保存的来源' : '应用画面与音频'}</button>{activeOutput && <p className="muted embedded-obs-note">停止直播输出和录制后，可调整来源或切换引擎。</p>}</> : <><h3><b>2</b> 外部 OBS 画面与音频</h3><p className="muted embedded-obs-note">在下方「外部 OBS 连接」中保存服务器设置、选择场景并添加 RiftCast HUD。在 OBS 同一场景准备游戏捕获、系统声音和解说音频。</p><a className="button small" href="#settings" onClick={()=>document.getElementById('external-obs-setup')?.scrollIntoView({block:'center'})}>打开外部 OBS 连接<ArrowRight size={14} /></a></>}
      </div><div className="embedded-obs-configuration embedded-obs-destination">
        <h3><b>3</b> 直播输出方式</h3>
        <label className="field"><span>目标平台</span>
          <select aria-label="直播输出方式" value={destination} disabled={!local || busy || !status || !!statusError || activeOutput || !cameraStateKnown}
            onChange={event => void run('output-destination', '/api/obs/engine/destination', { destination: event.target.value }, '直播输出方式已保存')}>
            <option value="rtmp">RTMP · B站及其他推流平台</option>
            <option value="douyin" disabled={mode !== 'embedded'}>抖音 · 直播伴侣</option>
          </select>
        </label>
        {companion ? <div className="companion-output-guide" aria-label="抖音直播伴侣接入">
          <strong><Camera size={16} />节目画面 + 完整混音 → 直播伴侣</strong>
          <p className="muted embedded-obs-note">发送导播台当前正式节目，切场景和回放随节目变化。直播伴侣负责登录、编码和开播。</p>
          <p className={camera?.driver.installed ? 'embedded-obs-success' : 'muted embedded-obs-note'} role="status">{camera?.driver.installed ? '虚拟摄像头已注册' : camera?.driver.error || '虚拟摄像头尚未安装'}</p>
          {(!camera?.driver.installed || camera.requiresRestart) && <><button className="button small" disabled={!local || busy || activeOutput || !camera?.driver.available} onClick={() => void run('install-camera', '/api/obs/engine/virtual-camera/install', {}, '虚拟摄像头与内置引擎已就绪，请重新打开直播伴侣')}><Camera size={14} />{pending === 'install-camera' ? '正在准备摄像头…' : camera?.requiresRestart ? '重新加载摄像头' : '安装虚拟摄像头'}</button><small className="muted">首次安装需接受 Windows 管理员授权；完成后自动重新加载内置引擎，请重新打开直播伴侣。</small></>}
          {camera?.error && <p role="alert" className="request-error">{camera.error}</p>}
          <button className="button small primary" disabled={!local || busy || activeOutput || !status?.available || status?.companionAudio?.needsRestart} onClick={() => void run('prepare-companion', '/api/obs/engine/companion/prepare', {}, '音画设备准备完成，请核对下方设备状态；首次安装音频驱动后需重启 Windows')}><Volume2 size={14} />{pending === 'prepare-companion' ? '正在准备音画…' : '自动准备完整音画'}</button>
          <p className={status?.companionAudio?.ready ? 'embedded-obs-success' : 'muted embedded-obs-note'} role="status">{status?.companionAudio?.active ? '完整混音正在送出 · 48 kHz 双声道' : status?.companionAudio?.ready ? '完整混音已就绪 · 48 kHz 双声道' : status?.companionAudio?.error || '请自动准备 VB-CABLE 虚拟麦克风'}</p>
          {status?.companionAudio?.active && <meter aria-label="伴侣完整混音电平" min={-60} max={0} value={status.companionAudio.peakDb ?? -60} />}
          <ol>
            <li>点击“自动准备完整音画”，接受首次驱动安装的 Windows 管理员授权；提示需要重启时先重启电脑。</li>
            <li>核对正式节目，点击“启动伴侣音画”。游戏、解说、回放和音乐共用 OB 的音量、静音和同步设置。</li>
            <li>在直播伴侣中添加素材 → 摄像头 → <b>OBS Virtual Camera</b>，按横屏画布适配画面。</li>
            <li>伴侣麦克风选择 <b>{status?.companionAudio?.capture?.name || 'CABLE Output (VB-Audio Virtual Cable)'}</b>，音量设为 100%，关闭额外的系统声音、原麦克风与降噪 / 自动增益。试听后点击“开始直播”。</li>
          </ol>
          <p className="companion-audio-note">OB 自动取节目音轨 1 的最终混音并送到虚拟麦克风，切回放时跟随原声 / 新解说策略。音乐文件在导播台「音频」中添加和播放。送出期间 OB 自动管理监听，停止后恢复。请在伴侣预览核对口型；若有延迟，可用各通道的同步偏移调整。</p>
          <small className="muted">VB-CABLE 来自 <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">VB-Audio Software</a>，采用 donationware 模式；欢迎通过 <a href="https://vb-audio.com/Services/licensing.htm" target="_blank" rel="noreferrer">官方商店支付许可</a>。基础版安装文件随 release 提供。</small>
          <a href="https://streamingtool.douyin.com/docs/guide_yr6qkl09" target="_blank" rel="noreferrer">抖音官方接入教程 ↗</a>
        </div> : <>
          <p className="muted embedded-obs-note">使用直播姬第三方模式或平台提供的本次 RTMP 信息。</p>
          <label className="field"><span>RTMP 服务器</span><input aria-label="RTMP 服务器" type="url" maxLength={2048} spellCheck={false} value={server} disabled={!canConfigure} onChange={event => { setServer(event.target.value); invalidateDestination(); }} placeholder="rtmp://主机/应用" /></label>
          <label className="field"><span>推流码</span><input aria-label="推流码" type="password" autoComplete="new-password" maxLength={1024} value={streamKey} disabled={!canConfigure} onChange={event => { setStreamKey(event.target.value); invalidateDestination(); }} placeholder="从直播应用复制本次推流码" /><small className="muted">应用成功后清空本页推流码。</small></label>
          <button className="button small" disabled={!canConfigure || !server.trim() || !streamKey.trim()} onClick={() => void applyDestination()}><Send size={14} />{pending === 'destination' ? '正在应用…' : '应用推流配置'}</button>
          <p className={destinationApplied ? 'embedded-obs-success' : 'muted embedded-obs-note'} role="status">{destinationApplied ? <><Check size={14} />本次推流地址已应用</> : '尚未确认本次推流地址，开播前请应用。'}</p>
        </>}
        <div className="embedded-obs-launch">
          <h3><b>4</b> 节目与输出</h3>
          {onOpenStudio && <button className="button primary" onClick={onOpenStudio}>进入导播台<ArrowRight size={16} /></button>}
          <p className="muted embedded-obs-note">{companion ? '先核对正式节目，再送到直播伴侣。开播和关播在伴侣中完成。' : '先核对节目、预监并完成切入，再开始推流。录制可独立启动。'}</p>
          <div className="embedded-obs-output-actions">
            {companion ? status?.virtualCamActive || status?.companionAudio?.managing || status?.companionAudio?.active ? <HoldButton disabled={!canOutput} onExecute={() => void output('stop-virtual-camera')}>按住停止伴侣音画</HoldButton> : <button className="button small primary" disabled={!canOutput || !destinationReady || !sourcesLoaded || dirty || status?.virtualCamActive !== false} onClick={() => void output('start-virtual-camera')}><Camera size={14} />{pending === 'start-virtual-camera' ? '正在送出…' : '启动伴侣音画'}</button>
              : status?.streamActive ? <HoldButton disabled={!canOutput} onExecute={() => void output('stop-stream')}>按住 1 秒停止推流</HoldButton> : <button className="button small primary" disabled={!canOutput || !destinationApplied || !sourcesLoaded || dirty} onClick={() => void output('start-stream')}><Radio size={14} />{pending === 'start-stream' ? '正在处理…' : '开始推流'}</button>}
            <button className={'button small ' + (status?.recordActive ? 'embedded-obs-stop' : '')} disabled={!canOutput || (!status?.recordActive && (!sourcesLoaded || dirty))} onClick={() => void output(status?.recordActive ? 'stop-record' : 'start-record')}>{status?.recordActive ? <Square size={14} /> : <Film size={14} />}{pending === 'start-record' || pending === 'stop-record' ? '正在处理…' : status?.recordActive ? '停止录制' : '开始录制'}</button>
          </div>
          <div className="embedded-obs-output-state">
            <span className={connected && (companion ? status?.virtualCamActive : status?.streamActive) ? 'active' : ''}><i />{companion ? !connected || status?.virtualCamActive == null ? '伴侣音画待确认' : status.virtualCamActive ? status.companionAudio?.active ? '伴侣音画已送出' : '混音异常 · 请核对'  : '伴侣音画已停止' : !connected ? '推流状态未确认' : status?.streamActive ? '推流进行中' : '推流已停止'}</span>
            <span className={connected && status?.recordActive ? 'recording' : ''}><i />录制{!connected ? '状态未确认' : status?.recordActive ? '进行中' : '已停止'}</span>
          </div>
          <p className="muted embedded-obs-note">{companion ? '画面输出状态由 OBS 确认。抖音开播状态、音画和回放声音请在伴侣与直播间核对。' : '状态由 OBS 确认；平台音画请在直播应用、直播间核对。'}</p>
        </div>
      </div></div>
    </div>
    {(statusError || status?.error || operationError) && <div className="embedded-obs-errors">{statusError && <p className="request-error" role="alert">{statusError}</p>}{status?.error && status.error !== statusError && <p className="request-error" role="alert">{status.error}</p>}{operationError && operationError !== status?.error && <p className="request-error" role="alert">{operationError}</p>}</div>}
    {!local && <p className="muted embedded-obs-remote-note">请在导播主机的 localhost 工作台控制引擎与直播输出。</p>}
  </section>;
}
function LayersIcon({ kind }: { kind: string }) { return kind.includes('audio') || kind.includes('wasapi') ? <Volume2 size={13} /> : <Monitor size={13} />; }
