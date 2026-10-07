import type { OBSResponseTypes } from 'obs-websocket-js';

type Stats = OBSResponseTypes['GetStats'];
type Stream = OBSResponseTypes['GetStreamStatus'];
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const delta = (current: unknown, previous: unknown) => Math.max(0, finite(current) - finite(previous));
const percentage = (dropped: number, total: number) => total > 0 ? Math.min(100, dropped / total * 100) : 0;

export type ObsPerformance = {
  available: boolean; configuredFps: number; encoder: string; hardwareEncoding: boolean;
  activeFps: number; cpuUsage: number; renderTimeMs: number; sampleSeconds: number;
  rendering: { frames: number; percent: number }; encoding: { frames: number; percent: number };
  network: { frames: number; percent: number; congestion: number; bitrateKbps: number; reconnecting: boolean; reconnectingSeconds: number };
  issues: string[];
};

/** OBS render/output counters and RTMP dropped-frame counters describe different bottlenecks. */
export class ObsPerformanceMonitor {
  private history:{at:number;stats:Stats;stream:Stream;outputActive:boolean}[]=[];
  private previous?: { at: number; stats: Stats; stream: Stream; outputActive: boolean };
  private reconnectStartedAt?:number;
  reset() { this.previous = undefined;this.history=[];this.reconnectStartedAt=undefined; }
  sample(stats: Stats, stream: Stream, outputActive: boolean, configuredFps: number, encoder: string, at = Date.now()): ObsPerformance {
    const latest=this.previous;
    if(latest&&(at<=latest.at||latest.outputActive!==outputActive||stats.renderTotalFrames<latest.stats.renderTotalFrames||stats.outputTotalFrames<latest.stats.outputTotalFrames||stream.outputDuration<latest.stream.outputDuration||stream.outputBytes<latest.stream.outputBytes))this.history=[];
    this.history=this.history.filter(s=>at-s.at<=10000);
    while(this.history.length>1&&at-this.history[1].at>=5000)this.history.shift();
    const old = this.history[0]??latest;
    const stable = Boolean(old && at > old.at && old.outputActive === outputActive &&
      stats.renderTotalFrames >= old.stats.renderTotalFrames && stats.outputTotalFrames >= old.stats.outputTotalFrames &&
      stream.outputDuration >= old.stream.outputDuration && stream.outputBytes >= old.stream.outputBytes);
    const seconds = stable && old ? (at - old.at) / 1000 : 0;
    const renderFrames = stable && old ? delta(stats.renderSkippedFrames, old.stats.renderSkippedFrames) : 0;
    const encodedFrames = stable && old && outputActive ? delta(stats.outputSkippedFrames, old.stats.outputSkippedFrames) : 0;
    const networkFrames = stable && old && stream.outputActive ? delta(stream.outputSkippedFrames, old.stream.outputSkippedFrames) : 0;
    const rendering = { frames: renderFrames, percent: percentage(renderFrames, stable && old ? delta(stats.renderTotalFrames, old.stats.renderTotalFrames) : 0) };
    const encoding = { frames: encodedFrames, percent: percentage(encodedFrames, stable && old ? delta(stats.outputTotalFrames, old.stats.outputTotalFrames) : 0) };
    if(stream.outputReconnecting){this.reconnectStartedAt??=at;}else this.reconnectStartedAt=undefined;
    const network = { frames: networkFrames, percent: percentage(networkFrames, stable && old ? delta(stream.outputTotalFrames, old.stream.outputTotalFrames) : 0), congestion: Math.min(1, finite(stream.outputCongestion)), bitrateKbps: seconds > 0 && stream.outputActive && old ? delta(stream.outputBytes, old.stream.outputBytes) * 8 / seconds / 1000 : 0, reconnecting: stream.outputReconnecting === true, reconnectingSeconds:this.reconnectStartedAt!==undefined?Math.max(0,(at-this.reconnectStartedAt)/1000):0 };
    const issues: string[] = [];
    if (rendering.percent >= 1 || (configuredFps > 0 && finite(stats.averageFrameRenderTime) > 1000 / configuredFps)) issues.push('画面渲染跟不上：降低游戏分辨率或限制游戏帧率，为 OBS 留出显卡余量');
    if (encoding.percent >= 1) issues.push('视频编码跟不上：使用硬件编码，或停止输出后切换到 30 帧');
    if (network.percent >= 1 || network.congestion >= .2 || network.reconnecting) issues.push('推流网络拥塞：检查上行带宽与平台接收端，停止推流后降低码率');
    this.previous = { at, stats, stream, outputActive };
    this.history.push(this.previous);
    return { available: true, configuredFps: finite(configuredFps), encoder, hardwareEncoding: /^(?:nvenc|amd|qsv|obs_nvenc_|ffmpeg_nvenc|obs_qsv|h264_texture_amf|com\.apple\.videotoolbox)/i.test(encoder), activeFps: finite(stats.activeFps), cpuUsage: finite(stats.cpuUsage), renderTimeMs: finite(stats.averageFrameRenderTime), sampleSeconds: seconds, rendering, encoding, network, issues };
  }
}
