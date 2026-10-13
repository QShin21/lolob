import type { ObsEngineStatus } from './EmbeddedObs';
import type { CompanionAudioStatus } from '../../shared/obs-output';

type SignalStatus = Pick<ObsEngineStatus, 'connected' | 'streamActive' | 'recordActive' | 'virtualCamActive' | 'companionAudio'>;
/** A selected destination never hides another output that may still be active. */
export function OutputSignals({ status }: { status: SignalStatus | null }) {
  const known = !!status?.connected;
  const signals = [
    { name: 'RTMP', active: known && status?.streamActive, text: !known ? '待确认' : status?.streamActive ? '发送中' : '停止' },
    { name: '摄像头', active: known && status?.virtualCamActive, text: !known || status?.virtualCamActive == null ? '待确认' : status.virtualCamActive ? '送出中' : '停止' },
    { name: '节目声音', active: known && status?.companionAudio?.active, text: !known || !status?.companionAudio ? '待确认' : status.companionAudio.active ? '桥接中' : status.companionAudio.managing ? '待恢复' : status.companionAudio.error ? '异常' : '停止' },
    { name: 'REC', active: known && status?.recordActive, text: !known ? '待确认' : status?.recordActive ? '录制中' : '停止' },
  ];
  return <div className="output-signals" aria-label="各路实际输出状态">{signals.map(signal => <span key={signal.name} data-active={!!signal.active}><i/><b>{signal.name}</b><small>{signal.text}</small></span>)}</div>;
}
export function ProgramAudioStatus({ audio }: { audio?: CompanionAudioStatus }) {
  const fresh = audio?.active && audio.peakDb !== undefined && audio.signalAgeMs !== undefined && audio.signalAgeMs < 2000;
  return <section className="program-audio-bus" aria-label="Program 最终混音">
    <div><strong>PROGRAM <span>总混音</span></strong><b>{fresh ? `${audio.peakDb!.toFixed(1)} dB` : '电平待采样'}</b></div>
    {fresh ? <meter min={-60} max={0} value={audio.peakDb!} aria-label="Program 最终混音电平"/> : <div className="signal-unavailable">{audio?.error || '暂无最终混音测量；单通道电平见下方'}</div>}
    <small>音轨 {audio?.track ?? 1} · {audio ? `${audio.sampleRate / 1000} kHz / ${audio.channels} 声道` : '48 kHz / 双声道'} · {audio?.active ? '桥接活动' : audio?.managing ? '仍托管中，请完成恢复' : '桥接未启动'}</small>
  </section>;
}
