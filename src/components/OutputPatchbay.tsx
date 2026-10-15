import { useEffect, useState } from 'react';
import { ArrowRight, Camera, Check, Monitor, Radio, Volume2 } from 'lucide-react';
import type { ObsEngineStatus } from './EmbeddedObs';
import type { OutputAction, OutputDestination } from '../../shared/obs-output';
import { HoldButton } from './ProductionDesk';
import { OutputSignals, ProgramAudioStatus } from './OutputSignals';
import './output-patchbay.css';

const fact = (value: boolean | undefined) => value === undefined ? '待查询' : value ? '是' : '否';
type Props = {
  status: ObsEngineStatus | null;
  connected: boolean;
  busy: boolean;
  local: boolean;
  activeOutput: boolean;
  canConfigure: boolean;
  canOutput: boolean;
  controlReason?: string;
  destination: OutputDestination;
  destinationApplied: boolean;
  sourcesLoaded: boolean;
  dirty: boolean;
  pending: string | null;
  receipt?: string;
  server: string;
  streamKey: string;
  setServer: (value: string) => void;
  setStreamKey: (value: string) => void;
  selectDestination: (value: OutputDestination) => void;
  applyDestination: () => void;
  output: (action: OutputAction) => void;
  prepare: (video: 'window' | 'camera') => void;
  installCamera: () => void;
  onOpenStudio?: () => void;
  onSection?: (section: 'video' | 'audio' | 'output') => void;
};

export function OutputPatchbay(p: Props) {
  const { status, connected, busy, local, activeOutput, canConfigure, canOutput } = p;
  // Inspecting a route is local UI. Changing the engine destination remains an explicit guarded request.
  const [route, setRoute] = useState<OutputDestination>(p.destination);
  const [video, setVideo] = useState<'window' | 'camera'>('window');
  const [programWindow, setProgramWindow] = useState({ open: false, minimized: false });
  const [windowBusy, setWindowBusy] = useState(false);
  const [windowError, setWindowError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const result = await window.riftcastDesktop?.programWindow('status'); if (active && result) setProgramWindow({ open: result.open, minimized: !!result.minimized }); }
      catch { if (active) setWindowError('节目窗口状态读取失败，请重试打开窗口'); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  async function controlWindow(action: 'open' | 'close') {
    setWindowBusy(true); setWindowError('');
    try {
      const result = await window.riftcastDesktop!.programWindow(action);
      setProgramWindow({ open: result.open, minimized: !!result.minimized });
    } catch (error) { setWindowError(error instanceof Error ? error.message : '节目窗口操作失败'); }
    finally { setWindowBusy(false); }
  }
  useEffect(() => setRoute(p.destination), [p.destination]);
  const audio = status?.companionAudio;
  const camera = status?.virtualCamera;
  const companion = route === 'douyin';
  const configured = route === p.destination;
  const cameraKnown = status?.virtualCamActive != null;
  const companionActive = !!status?.virtualCamActive || !!audio?.active || !!audio?.managing;
  const windowMode = video === 'window';
  const companionReady = (windowMode ? programWindow.open && !programWindow.minimized : !!camera?.driver.installed && !camera.requiresRestart) && !!audio?.ready;
  const destinationReady = configured && (companion ? companionReady : p.destinationApplied);
  const selectionLocked = !local || !!p.controlReason || busy || !status || activeOutput
    || status.mode === 'embedded' && !cameraKnown;
  const selectedActive = companion ? companionActive : !!status?.streamActive;
  const startReason = !local ? '请在导播主机的 localhost 工作台操作。'
    : p.controlReason || (!connected ? '先连接 OBS 引擎。'
      : busy ? '等待当前操作完成。'
      : !configured ? '将此路径设为下一次输出后，再准备启动。'
      : !p.sourcesLoaded ? '先在画面设置中应用游戏与音频来源。'
      : p.dirty ? '画面与音频来源有未应用修改。'
      : companion && !windowMode && !cameraKnown ? '虚拟摄像头状态未知，请刷新引擎状态。'
      : companion && !windowMode && camera?.requiresRestart ? '摄像头已注册，等待在停播窗口重新加载引擎。'
      : companion && windowMode && !programWindow.open ? '请先打开独立节目窗口，并在伴侣添加窗口素材。'
      : companion && windowMode && programWindow.minimized ? '请恢复节目窗口，保持窗口在桌面上。'
      : companion && audio?.needsRestart ? '音频设备等待 Windows 重启后加载。'
      : !destinationReady ? companion ? '设备尚未就绪，请展开设备准备查看原因。' : '先应用本次 RTMP 服务器和推流码。'
      : '');
  const canStart = canOutput && !startReason && !selectedActive;
  const setupBlocked = !local || !!p.controlReason || busy || activeOutput || status?.mode !== 'embedded';
  const sample = (value: number | undefined) => value === undefined || !Number.isFinite(value) ? '未提供' : value.toLocaleString('zh-CN');

  return <div className="output-patchbay">
    <section className="patchbay-running" aria-label="实际运行状态与独立停止">
      <div className="patchbay-running-summary"><div className="patchbay-running-heading"><h3>当前实际运行</h3><span>{connected ? '来自 OBS 与节目音频桥' : '状态未确认，请刷新连接'}</span></div>
      <OutputSignals status={connected ? status : null} /></div>
      <div className="patchbay-stop-actions">
        {!!status?.streamActive && <HoldButton disabled={!canOutput} onExecute={() => p.output('stop-stream')}>按住停止 RTMP</HoldButton>}
        {companionActive && <HoldButton disabled={!canOutput} onExecute={() => p.output(status?.virtualCamActive ? 'stop-virtual-camera' : 'stop-companion-audio')}>{audio?.managing && !audio.active ? '按住重试停止并恢复音频' : '按住停止伴侣送出'}</HoldButton>}
        <button className="button" disabled={!canOutput || !status?.recordActive && (!p.sourcesLoaded || p.dirty)} onClick={() => p.output(status?.recordActive ? 'stop-record' : 'start-record')}>
          {status?.recordActive ? '停止本机录制' : '开始本机录制'}
        </button>
        <span>{companionActive ? '收尾时先在伴侣结束直播，再停止此处音画。' : '录制、RTMP 和伴侣音画分别控制。'}</span>
      </div>
      {p.receipt && <p className="patchbay-receipt" role="status"><Check size={15} /><span><b>最近操作回执</b>{p.receipt}</span></p>}
      {audio?.managing && !audio.active && <p className="patchbay-warning" role="alert">音频桥未活动，但路由仍由 RiftCast 托管。请重试停止并恢复；恢复失败的记录会保留。</p>}
    </section>

    {companion && <section className="patchbay-receiver-check" aria-label="伴侣视频接入方式">
      <h3>视频接入方式</h3>
      <div className="patchbay-buttons">
        <button className="button" aria-pressed={windowMode} disabled={companionActive} onClick={() => setVideo('window')}>窗口采集（推荐）</button>
        <button className="button" aria-pressed={!windowMode} disabled={companionActive} onClick={() => setVideo('camera')}>虚拟摄像头</button>
      </div>
      {windowMode && <>
        <p>在直播伴侣添加「窗口」素材，选择「RiftCast 节目输出」。窗口连续显示正式节目，预监内容经 TAKE 后才会进入。保持窗口打开且不要最小化；建议放在第二块屏幕，采集客户区并关闭鼠标显示。</p>
        <div className="patchbay-buttons">
          <button className="button primary" disabled={!window.riftcastDesktop || !canOutput || windowBusy || status?.mode !== 'embedded'} onClick={() => void controlWindow('open')}>{windowBusy ? '处理中…' : programWindow.open ? '显示 / 恢复节目窗口' : '打开节目输出窗口'}</button>
          <button className="button" disabled={!programWindow.open || windowBusy || !canOutput} onClick={() => void controlWindow('close')}>关闭节目窗口</button>
          <span role="status">{programWindow.open ? programWindow.minimized ? '窗口已最小化，请恢复' : '节目窗口已打开' : '节目窗口未打开'}</span>
        </div>
        {!window.riftcastDesktop && <p>请使用 RiftCast 桌面版打开节目窗口。</p>}
        {windowError && <p role="alert">{windowError}</p>}
      </>}
    </section>}

    <div className="patchbay-path-choice">
      <div className="patchbay-path-tabs" role="group" aria-label="查看输出路径">
        <button aria-pressed={!companion} onClick={() => setRoute('rtmp')}><Radio size={17} /><span>RTMP 推流</span></button>
        <button aria-pressed={companion} onClick={() => setRoute('douyin')}><Camera size={17} /><span>抖音直播伴侣</span></button>
      </div>
      <div className="patchbay-destination">
        <span>引擎已配置<strong>{status ? p.destination === 'douyin' ? '抖音直播伴侣' : 'RTMP' : '待查询'}</strong></span>
        {!configured && <button className="button small" disabled={selectionLocked || companion && status?.mode !== 'embedded'} onClick={() => p.selectDestination(route)}>
          {p.pending === 'output-destination' ? '正在应用…' : '设为下一次输出'}
        </button>}
      </div>
      {!configured && <p className="patchbay-route-note">
        {activeOutput ? '当前仅查看此路径；停止活动输出与录制后可更改引擎配置。' : companion && status?.mode === 'external' ? '伴侣音画需要内置 OBS；当前仅查看路径。' : '当前仅查看此路径；设置引擎目标不会启动送出。'}
      </p>}
    </div>

    <section className="patchbay-route-map" aria-label={companion ? 'Program 到直播伴侣的音画路径' : 'Program 到 RTMP 的音画路径'}>
      <div className="patchbay-program-source">
        <Monitor size={24} />
        <strong>PGM</strong>
        <span>正式节目</span>
        <small title={status?.sceneName}>{connected ? status?.sceneName || '场景名称未提供' : '等待引擎连接'}</small>
        {p.onOpenStudio && <button onClick={p.onOpenStudio}>核对节目画面</button>}
      </div>
      <div className="patchbay-route-lines">
        <div className="patchbay-route-labels" aria-hidden="true"><span>Program 信号</span><span>送出设备</span><span>接收端</span></div>
        <div className="patchbay-route-line">
          <div className="patchbay-route-origin"><Camera size={17} /><strong>视频</strong><small>当前正式节目</small></div>
          <ArrowRight className="patchbay-route-arrow" size={17} aria-hidden="true" />
          <div className="patchbay-route-node"><strong>{companion ? windowMode ? 'RiftCast 节目输出' : 'OBS Virtual Camera' : 'OBS 视频编码'}</strong><small>{companion ? windowMode ? programWindow.open ? '独立节目窗口已打开' : '窗口未打开' : !connected || !cameraKnown ? '运行状态待确认' : status?.virtualCamActive ? '视频正在送出' : '摄像头已停止' : '随 RTMP 推流启动'}</small></div>
          <ArrowRight className="patchbay-route-arrow" size={17} aria-hidden="true" />
          <div className="patchbay-route-node"><strong>{companion ? windowMode ? '伴侣窗口素材' : '伴侣摄像头' : 'RTMP 接收地址'}</strong><small>{companion ? windowMode ? '选择 RiftCast 节目输出' : '手动选择 OBS Virtual Camera' : '平台接收情况待人工核对'}</small></div>
        </div>
        <div className="patchbay-route-line">
          <div className="patchbay-route-origin"><Volume2 size={17} /><strong>音轨 1</strong><small>最终 Program 混音</small></div>
          <ArrowRight className="patchbay-route-arrow" size={17} aria-hidden="true" />
          <div className="patchbay-route-node"><strong>{companion ? 'CABLE Input' : 'OBS 节目音频编码'}</strong><small>{companion ? '48 kHz / 双声道' : '与正式节目画面一同发送'}</small>{companion && <span title={audio?.render?.name}>{audio?.render?.name || '送出端点尚未识别'}</span>}</div>
          <ArrowRight className="patchbay-route-arrow" size={17} aria-hidden="true" />
          <div className="patchbay-route-node"><strong>{companion ? 'CABLE Output' : 'RTMP 平台音频'}</strong><small>{companion ? '在伴侣麦克风中选择' : '在平台预览中试听'}</small>{companion && <span title={audio?.capture?.name}>{audio?.capture?.name || '接收端点尚未识别'}</span>}</div>
        </div>
      </div>
    </section>

    <section className="patchbay-start-strip" aria-label="启动选定输出">
      <div><strong>{companion ? windowMode ? '启动伴侣节目混音' : '启动伴侣音画' : '开始 RTMP 推流'}</strong><p>{selectedActive ? companion ? '已有伴侣链路活动；停止与恢复入口在上方运行栏。' : 'RTMP 正在运行。' : startReason || '启动会将当前正式节目的画面与声音送出。'}</p></div>
      <button className="button" onClick={() => p.onSection?.('audio')} disabled={!p.onSection}>核对混音与音乐</button>
      <button className="button primary" disabled={!canStart} onClick={() => p.output(companion ? windowMode ? 'start-companion-audio' : 'start-virtual-camera' : 'start-stream')}>
        <PlayMark />{busy && (p.pending === 'start-virtual-camera' || p.pending === 'start-stream') ? '等待引擎回执…' : companion ? windowMode ? '启动伴侣节目混音' : '启动伴侣音画' : '开始 RTMP 推流'}
      </button>
    </section>

    <div className="patchbay-check-and-meter">
      <div className="patchbay-receiver-check">
        <h3>在接收端核对</h3>
        <p>{companion ? (windowMode ? '窗口素材选择 RiftCast 节目输出；' : '伴侣摄像头选择 OBS Virtual Camera；') + '麦克风选择 CABLE Output。使用基础双声道端点，避免选择额外的 16ch 端点。' : '打开直播平台预览，核对当前比赛画面、游戏声、解说和音乐，再检查直播间。'}</p>
        {companion && <p>麦克风音量设为 100%；按接入策略关闭重复系统声、原麦克风及降噪 / 自动增益，试听后由操作者在伴侣开播。</p>}
        <span className="patchbay-manual-status">平台开播 / 接收状态：待人工核对</span>
      </div>
      <ProgramAudioStatus audio={connected ? audio : undefined} />
    </div>

    {companion ? <details className="patchbay-device-preparation" open={!companionReady || !!audio?.error || !!camera?.error || !!camera?.driver.error}>
      <summary><strong>设备准备与恢复</strong><span>{companionReady ? '设备已就绪，可按需检查' : '查看未就绪原因与准备入口'}</span></summary>
      <div className="patchbay-device-grid">
        {!windowMode && <section><h4>OBS Virtual Camera</h4><dl>
          <Fact label="当前引擎支持" value={camera?.supported} />
          <Fact label="安装组件可用" value={camera?.driver.available} />
          <Fact label="驱动已注册" value={camera?.driver.installed} />
          <Fact label="运行状态可查询" value={connected ? cameraKnown : undefined} />
          <Fact label="正在送出视频" value={connected && cameraKnown ? !!status?.virtualCamActive : undefined} />
          <Fact label="需要重新加载引擎" value={camera?.requiresRestart} />
        </dl>{(camera?.error || camera?.driver.error) && <p className="patchbay-error" role="alert">{camera.error || camera.driver.error}</p>}</section>}
        <section><h4>Program 音频桥</h4><dl>
          <Fact label="当前引擎支持" value={audio?.supported} />
          <Fact label="混音组件已加载" value={audio?.available} />
          <Fact label="音频驱动已安装" value={audio?.installed} />
          <Fact label="端点与组件就绪" value={audio?.ready} />
          <Fact label="音频桥正在活动" value={connected ? audio?.active : undefined} />
          <Fact label="仍在托管路由" value={audio?.managing} />
          <Fact label="需要重启 Windows" value={audio?.needsRestart} />
        </dl>{audio?.error && <p className="patchbay-error" role="alert">{audio.error}</p>}</section>
      </div>
      <div className="patchbay-prepare-controls">
        <div><strong>首次准备可能要求 Windows 管理员授权</strong><p>窗口模式检查基础版 VB-CABLE；摄像头模式同时准备虚拟摄像头。复用有效组件；音频驱动安装后可能需要重启。准备不会在伴侣中开播。</p></div>
        <div className="patchbay-buttons">
          <button className="button" disabled={setupBlocked || !status?.available || !!audio?.needsRestart} onClick={() => p.prepare(video)}>
            <Volume2 size={15} />{p.pending === 'prepare-companion' ? '正在准备…' : windowMode ? '准备节目音频设备' : '准备完整音画设备'}
          </button>
          {!windowMode && <button className="button small" disabled={setupBlocked || !camera?.driver.available} onClick={p.installCamera}>仅准备虚拟摄像头</button>}
        </div>
        <p className="patchbay-setup-limit">{activeOutput ? '活动输出或录制期间不能准备设备。' : audio?.needsRestart ? '先保存工作并由操作者重启 Windows，再刷新设备状态。' : !local ? '设备准备仅允许在导播主机操作。' : p.controlReason || '取消授权、驱动待加载或恢复失败时，按上方具体错误处理。'}</p>
        <small>VB-CABLE：<a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">VB-Audio 官方来源</a> / <a href="https://vb-audio.com/Services/licensing.htm" target="_blank" rel="noreferrer">许可说明</a>。原游戏输出与真实麦克风须保持正确，避免形成反馈回路。</small>
      </div>
    </details> : <section className="patchbay-credentials" aria-label="本次 RTMP 推流配置">
      <div className="patchbay-credentials-heading"><h3>本次推流凭据</h3><span>{p.destinationApplied && configured ? '引擎已确认应用' : '等待应用本次凭据'}</span></div>
      <div className="patchbay-credential-fields">
        <label>RTMP 服务器<input aria-label="RTMP 服务器" type="url" maxLength={2048} value={p.server} disabled={!canConfigure || !configured} onChange={e => p.setServer(e.target.value)} placeholder="rtmp://主机/应用" autoComplete="off" spellCheck={false} /></label>
        <label>推流码<input aria-label="推流码" type="password" autoComplete="new-password" maxLength={1024} value={p.streamKey} disabled={!canConfigure || !configured} onChange={e => p.setStreamKey(e.target.value)} placeholder="从直播应用复制本次推流码" /></label>
        <button className="button" disabled={!canConfigure || !configured || !p.server.trim() || !p.streamKey.trim()} onClick={p.applyDestination}>{p.pending === 'destination' ? '正在应用…' : '应用推流配置'}</button>
      </div>
      <p>凭据仅用于本次引擎配置；应用成功后清空推流码，不保存到浏览器。活动输出或录制期间不能更改。</p>
    </section>}

    <details className="patchbay-diagnostics">
      <summary>音频桥采样与端点诊断</summary>
      <dl>
        <div><dt>送出端点</dt><dd>{audio?.render?.name || '未提供'}</dd></div>
        <div><dt>接收端点</dt><dd>{audio?.capture?.name || '未提供'}</dd></div>
        <div><dt>采样率 / 声道 / 音轨</dt><dd>{audio ? audio.sampleRate + ' Hz / ' + audio.channels + ' / ' + audio.track : '未提供'}</dd></div>
        <div><dt>样本年龄</dt><dd>{audio?.signalAgeMs === undefined ? '未提供' : sample(audio.signalAgeMs) + ' ms'}</dd></div>
        <div><dt>接收帧</dt><dd>{sample(audio?.receivedFrames)}</dd></div>
        <div><dt>渲染帧</dt><dd>{sample(audio?.renderedFrames)}</dd></div>
        <div><dt>丢帧</dt><dd>{sample(audio?.droppedFrames)}</dd></div>
        <div><dt>欠载</dt><dd>{sample(audio?.underruns)}</dd></div>
      </dl>
      <p>端点存在、电平采样、桥接活动分别证明对应环节；伴侣与观众端声音仍需人工试听。</p>
    </details>
  </div>;
}

function Fact({ label, value }: { label: string; value: boolean | undefined }) {
  return <div><dt>{label}</dt><dd>{fact(value)}</dd></div>;
}
function PlayMark() {
  return <span className="patchbay-play-mark" aria-hidden="true">▶</span>;
}
