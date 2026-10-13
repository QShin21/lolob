import type { ObsEngineStatus } from './EmbeddedObs';
import type { OutputAction, OutputDestination } from '../../shared/obs-output';
import { HoldButton } from './ProductionDesk';
import { OutputSignals, ProgramAudioStatus } from './OutputSignals';
import { ArrowRight, Camera, Radio, Volume2 } from 'lucide-react';
import './output-patchbay.css';
const fact = (value: boolean | undefined) => value === undefined ? '待查询' : value ? '是' : '否';
type Props = {
  status: ObsEngineStatus | null; connected: boolean; busy: boolean; local: boolean; activeOutput: boolean; canConfigure: boolean; canOutput: boolean;
  destination: OutputDestination; destinationApplied: boolean; destinationReady: boolean; sourcesLoaded: boolean; dirty: boolean; pending: string | null;
  server: string; streamKey: string; setServer: (value: string) => void; setStreamKey: (value: string) => void;
  selectDestination: (value: OutputDestination) => void; applyDestination: () => void; output: (action: OutputAction) => void; prepare: () => void; installCamera: () => void; onOpenStudio?: () => void;
};
export function OutputPatchbay(p: Props) {
  const { status, connected, busy, local, activeOutput, canConfigure, canOutput, destination, destinationReady, sourcesLoaded, dirty } = p;
  const audio = status?.companionAudio, camera = status?.virtualCamera;
  const companionActive = !!status?.virtualCamActive || !!audio?.active || !!audio?.managing;
  return <div className="output-patchbay">
    <header className="patchbay-heading"><div><h2>节目送出</h2><p>当前选择决定下一次启动的路径，各路运行状态独立保留。</p></div><OutputSignals status={connected ? status : null}/></header>
    <div className="patchbay-selector" aria-label="选择输出路径">{([{ id: 'rtmp', title: 'RTMP', detail: '推流地址 / 本次凭据', icon: Radio }, { id: 'douyin', title: '抖音直播伴侣', detail: '虚拟视频 / Program 混音', icon: Camera }] as const).map(item => <button key={item.id} aria-pressed={destination === item.id} disabled={!local || busy || !status || activeOutput || status.virtualCamActive === null || item.id === 'douyin' && status.mode !== 'embedded'} onClick={() => p.selectDestination(item.id)}><item.icon size={19}/><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</div>
    <div className="patchbay-grid">
      <section className="signal-routing" aria-label="节目音画路径">
        <h3>信号路径 <span>仅发送 Program</span></h3>
        <div className="signal-route"><b>PGM<span>正式节目</span></b><ArrowRight size={18}/><div><strong>{destination === 'douyin' ? 'OBS Virtual Camera' : 'OBS 编码器'}</strong><small>{destination === 'douyin' ? '视频 · 独立摄像头输出' : '画面与节目混音'}</small></div><ArrowRight size={18}/><div><strong>{destination === 'douyin' ? '伴侣摄像头' : 'RTMP 平台'}</strong><small>{destination === 'douyin' ? '在伴侣选择设备' : '核对平台接收画面'}</small></div></div>
        {destination === 'douyin' && <div className="signal-route audio"><b>音轨 1<span>最终混音</span></b><ArrowRight size={18}/><div><strong>CABLE Input</strong><small>48 kHz · 双声道送出</small></div><ArrowRight size={18}/><div><strong>CABLE Output</strong><small>伴侣麦克风接收端</small></div></div>}
        <ProgramAudioStatus audio={audio}/>
        {destination === 'douyin' ? <>
          <details className="patchbay-device-setup" open={!audio?.ready || !camera?.driver.installed}><summary>设备准备与恢复</summary>
            <div className="device-facts"><div><strong>虚拟摄像头</strong><span>系统支持 <b>{fact(camera?.supported)}</b></span><span>组件可用 <b>{fact(camera?.driver.available)}</b></span><span>已注册 <b>{fact(camera?.driver.installed)}</b></span><span>需重新加载 <b>{fact(camera?.requiresRestart)}</b></span></div><div><strong>Program 音频桥</strong>{([['系统支持', audio?.supported], ['组件可用', audio?.available], ['驱动已安装', audio?.installed], ['端点就绪', audio?.ready], ['桥接活动', audio?.active], ['路由托管中', audio?.managing], ['需要重启', audio?.needsRestart]] as const).map(([label, value]) => <span key={label}>{label}<b>{fact(value)}</b></span>)}</div></div>
            {(camera?.error || camera?.driver.error || audio?.error) && <p className="patchbay-error" role="alert">{camera?.error || camera?.driver.error} {audio?.error}</p>}
            <p>首次准备可能安装摄像头与 VB-CABLE，需要 Windows 管理员授权；音频驱动安装后可能需要重启。有效组件会复用。</p>
            <div className="patchbay-buttons"><button className="button small" disabled={!local || busy || activeOutput || !camera?.driver.available} onClick={p.installCamera}>准备虚拟摄像头</button><button className="button small" disabled={!local || busy || activeOutput || !status?.available || audio?.needsRestart} onClick={p.prepare}><Volume2 size={14}/>{p.pending === 'prepare-companion' ? '正在准备…' : '自动准备完整音画'}</button></div>
            <small>VB-CABLE 来源：<a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer">VB-Audio</a> · <a href="https://vb-audio.com/Services/licensing.htm" target="_blank" rel="noreferrer">许可说明</a>。取消授权或恢复失败时保留记录，按具体错误处理。</small>
          </details>
        </> : <div className="rtmp-credentials"><h3>本次推流凭据</h3><label>RTMP 服务器<input aria-label="RTMP 服务器" type="url" maxLength={2048} value={p.server} disabled={!canConfigure} onChange={e => p.setServer(e.target.value)} placeholder="rtmp://主机/应用" spellCheck={false}/></label><label>推流码<input aria-label="推流码" type="password" autoComplete="new-password" maxLength={1024} value={p.streamKey} disabled={!canConfigure} onChange={e => p.setStreamKey(e.target.value)} placeholder="从直播应用复制本次推流码"/></label><div className="patchbay-buttons"><button className="button" disabled={!canConfigure || !p.server.trim() || !p.streamKey.trim()} onClick={p.applyDestination}>应用推流配置</button><span>{p.destinationApplied ? '本次凭据已应用' : '等待应用本次凭据'}</span></div><small>凭据只用于本次引擎配置，成功后清空输入；不会保存到浏览器。</small></div>}
      </section>
      <section className="patchbay-launch" aria-label="启动与接收核对">
        <h3>送出与核对</h3>
        <ol><li><b>01</b><div><strong>核对正式节目</strong><p>确认画面、游戏声、解说与音乐。TAKE 应用后再核对本版节目。</p><button className="button small" onClick={p.onOpenStudio}>返回导播台 →</button></div></li><li><b>02</b><div><strong>{destination === 'douyin' ? '启动伴侣音画' : '启动 RTMP 推流'}</strong><p>{!connected ? '先连接 OBS 引擎。' : !sourcesLoaded ? '先准备游戏与音频来源。' : dirty ? '来源有待应用修改。' : '启动会影响正式输出。'}</p>{destination === 'douyin' ? !companionActive && <button className="button primary" disabled={!canOutput || !destinationReady || !sourcesLoaded || dirty || status?.virtualCamActive !== false} onClick={() => p.output('start-virtual-camera')}>启动伴侣音画</button> : !status?.streamActive && <button className="button primary" disabled={!canOutput || !p.destinationApplied || !sourcesLoaded || dirty} onClick={() => p.output('start-stream')}>开始 RTMP 推流</button>}</div></li><li><b>03</b><div><strong>在接收端人工核对</strong>{destination === 'douyin' ? <p>摄像头选 <b>OBS Virtual Camera</b>；麦克风选 <b>{audio?.capture?.name || 'CABLE Output (VB-Audio Virtual Cable)'}</b>，音量 100%。按接入策略关闭重复系统声、原麦克风与降噪/自动增益，试听再在伴侣开播。</p> : <p>在平台预览与直播间检查画面、声音和延迟；引擎回执不代表平台已收流。</p>}<span className="manual-check-label">外部平台开播状态：待人工核对</span></div></li></ol>
        <div className="patchbay-stop"><h3>独立输出控制</h3>{status?.streamActive && <HoldButton disabled={!canOutput} onExecute={() => p.output('stop-stream')}>按住停止 RTMP</HoldButton>}{companionActive && <><p>先在伴侣结束直播，再停止 RiftCast 音画送出。</p><HoldButton disabled={!canOutput} onExecute={() => p.output('stop-virtual-camera')}>{audio?.managing && !audio.active ? '按住重试停止并恢复音频' : '按住停止伴侣音画'}</HoldButton></>}<button className="button" disabled={!canOutput || !status?.recordActive && (!sourcesLoaded || dirty)} onClick={() => p.output(status?.recordActive ? 'stop-record' : 'start-record')}>{status?.recordActive ? '停止本机录制' : '开始本机录制'}</button></div>
      </section>
    </div>
    {audio && <details className="patchbay-diagnostics"><summary>音频桥真实采样与路由诊断</summary><dl>{[['送出端点', audio.render?.name], ['接收端点', audio.capture?.name], ['样本年龄 ms', audio.signalAgeMs], ['接收帧', audio.receivedFrames], ['渲染帧', audio.renderedFrames], ['丢帧', audio.droppedFrames], ['欠载', audio.underruns]].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '未提供'}</dd></div>)}</dl><p>电平和设备存在只证明对应环节；伴侣实际接收和观众声音需要人工试听。</p></details>}
  </div>;
}
