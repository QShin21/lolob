import { useEffect, useId, useRef, useState } from 'react';
import { Music2, Pause, Play, SlidersHorizontal, Square, Volume2, VolumeX } from 'lucide-react';
import type { AudioBus, TaskContext } from './ProductionDesk';
import { ProgramAudioStatus } from './OutputSignals';
import { api } from '../lib';
import './audio-workspace.css';

export function AudioWorkspace(ctx: TaskContext) {
  const [expanded, setExpanded] = useState(false);
  const buses = ctx.status?.audio ?? ['RiftCast 桌面音频', 'RiftCast 解说麦克风', 'RiftCast 采访', 'RiftCast 音乐', 'RiftCast 回放片段'].map(name => ({ name, available: false }) as AudioBus);
  return <div className="audio-workspace">
    <div className="audio-channel-bank" data-expanded={expanded}>
      {buses.filter(bus => expanded || /桌面|解说|音乐/.test(bus.name)).map(bus => <AudioChannel key={bus.name} bus={bus} ctx={ctx}/>)}
    </div>
    <button className="audio-more-channels" onClick={() => setExpanded(!expanded)}>{expanded ? '收起采访与回放' : '采访与回放通道'}</button>
    <ProgramAudioStatus audio={ctx.status?.companionAudio}/>
    <MusicTransport ctx={ctx}/>
    <details className="audio-track-settings"><summary>录制音轨设置</summary><p>{ctx.status?.audioManaged ? '伴侣送出正在托管音轨和监听；停止并恢复后才能更改。' : '在停播窗口配置成品、游戏和解说三轨录制。'}</p><button className="button small" disabled={ctx.busy || !ctx.canOutput || !!ctx.status?.audioManaged || !!ctx.engine?.streamActive || !!ctx.engine?.recordActive || !!ctx.engine?.virtualCamActive} onClick={() => ctx.obs({ action: 'tracks' })}>配置三轨录制</button></details>
  </div>;
}

function AudioChannel({ bus, ctx }: { bus: AudioBus; ctx: TaskContext }) {
  const [gain, setGain] = useState(bus.db ?? 0);
  const editing = useRef(false), panelId = useId();
  const disabled = ctx.busy || !ctx.canOutput || !bus.available;
  const gainKnown = bus.db !== undefined && Number.isFinite(bus.db);
  const meter = bus.meterAvailable && bus.peakDb !== undefined && Number.isFinite(bus.peakDb);
  useEffect(() => { if (!editing.current) setGain(bus.db ?? 0); }, [bus.db]);
  const submit = (value: number) => { if (!editing.current) return; editing.current = false; ctx.obs({ action: 'audio', name: bus.name, db: value }); };
  const label = bus.name.replace('RiftCast ', '').replace('桌面音频', '桌面').replace('解说麦克风', '解说').replace('回放片段', '回放');
  return <section className="audio-channel" aria-label={`${label}通道`} data-muted={bus.muted}>
    <header><strong title={bus.name}>{label}</strong><button className="audio-channel-settings" aria-label={`${label}通道设置`} popoverTarget={panelId}><SlidersHorizontal size={13}/></button><span>{!bus.available ? '未接入' : bus.muted === undefined ? '状态未知' : bus.muted ? '已静音' : '送往节目'}</span></header>
    <output aria-label={`${bus.name} 增益`}>{bus.available && gainKnown ? gain.toFixed(1) : '—'} <small>dB</small></output>
    <div className="audio-fader-well">
      <div className="audio-fader-scale" aria-hidden="true"><span>+6</span><span>0</span><span>−18</span><span>−60</span></div>
      <input type="range" aria-label={`${bus.name} 音量`} aria-orientation="vertical" min={-60} max={6} step={0.5} value={gain} disabled={disabled || !gainKnown}
        onChange={e => { editing.current = true; setGain(Number(e.target.value)); }}
        onPointerUp={e => submit(Number(e.currentTarget.value))}
        onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) submit(Number(e.currentTarget.value)); }}
        onBlur={e => submit(Number(e.currentTarget.value))}/>
      <div className="audio-signal-column" role={meter ? 'meter' : undefined} aria-label={`${bus.name} 电平`} aria-valuemin={meter ? -60 : undefined} aria-valuemax={meter ? 0 : undefined} aria-valuenow={meter ? bus.peakDb : undefined}>
        {meter ? <span style={{ height: `${Math.min(100, Math.max(0, (bus.peakDb! + 60) / 60 * 100))}%` }} data-clipping={(bus.heldPeakDb ?? bus.peakDb!) > -1}/> : <span className="audio-no-meter">—</span>}
      </div>
    </div>
    <small className="audio-meter-value">{meter ? `${bus.peakDb!.toFixed(1)} dB` : '电平未提供'}</small>
    <button className="audio-mute" aria-label={`${bus.name} ${bus.muted ? '取消静音' : '静音'}`} aria-pressed={!!bus.muted} disabled={disabled} onClick={() => ctx.obs({ action: 'audio', name: bus.name, muted: !bus.muted })}>{bus.muted ? <VolumeX size={14}/> : <Volume2 size={14}/>}<span>{bus.muted ? '取消静音' : '静音'}</span></button>
    <div id={panelId} popover="auto" className="broadcast-popover audio-channel-popover">
      <h3>{label}通道</h3><p>{bus.name} · 增益与静音立即影响节目。</p>
      <p>峰值保持：{bus.heldPeakDb === undefined || !Number.isFinite(bus.heldPeakDb) ? '未提供' : `${bus.heldPeakDb.toFixed(1)} dB`}（约 3.5 秒）</p>
      <label>监听<select aria-label={`${bus.name} 监听`} disabled={disabled || !!ctx.status?.audioManaged} value={bus.monitor ?? 'OBS_MONITORING_TYPE_NONE'} onChange={e => ctx.obs({ action: 'audio', name: bus.name, monitor: e.target.value })}><option value="OBS_MONITORING_TYPE_NONE">关闭监听</option><option value="OBS_MONITORING_TYPE_MONITOR_ONLY">仅监听</option><option value="OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT">监听并送节目</option></select></label>
      <label>同步偏移（ms）<input type="number" aria-label={`${bus.name} 同步偏移毫秒`} min={-10000} max={10000} defaultValue={bus.syncOffset ?? 0} disabled={disabled} onBlur={e => { if (Number(e.target.value) !== bus.syncOffset) ctx.obs({ action: 'audio', name: bus.name, syncOffset: Number(e.target.value) }); }}/></label>
      <small>{ctx.status?.audioManaged ? '伴侣送出正在托管监听；停止并恢复后才能更改。' : '监听请使用独立耳机，避免返送重复采集。'}</small>
    </div>
  </section>;
}

function MusicTransport({ ctx }: { ctx: TaskContext }) {
  const music = ctx.status?.music;
  const [uploading, setUploading] = useState(false);
  const outputs = [ctx.engine?.streamActive ? 'RTMP' : null, ctx.engine?.recordActive ? '录制' : null, ctx.engine?.virtualCamActive ? '伴侣视频' : null, ctx.engine?.companionAudio?.active || ctx.engine?.companionAudio?.managing ? '伴侣音频' : null].filter(Boolean);
  const mediaState = music?.state, playing = mediaState === 'OBS_MEDIA_STATE_PLAYING';
  const label = !music?.available ? '来源未接入' : mediaState === 'OBS_MEDIA_STATE_PAUSED' ? '已暂停' : mediaState === 'OBS_MEDIA_STATE_STOPPED' ? '已停止' : mediaState === 'OBS_MEDIA_STATE_ENDED' ? '播放结束' : playing ? music.playing ? '正在播放' : '播放中 · 已静音' : '媒体状态待确认';
  const control = (action: 'play' | 'pause' | 'stop') => void ctx.run(() => api('/api/obs/music/control', { method: 'POST', body: JSON.stringify({ action }) }), `节目音乐已${action === 'play' ? '播放' : action === 'pause' ? '暂停' : '停止'}`);
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) { ctx.notify('音乐文件不能超过 32 MB', 'error'); return; }
    setUploading(true);
    try { const body = new FormData(); body.append('file', file); await ctx.run(() => api('/api/obs/music', { method: 'POST', body }), '音乐已保存；新来源暂停、静音，初始增益 -18 dB'); }
    finally { setUploading(false); }
  }
  return <section className="music-transport" aria-label="节目音乐控制">
    <header><Music2 size={16}/><strong>节目音乐</strong><span>{label}</span></header>
    <div className="music-file"><p title={music?.name}>{music?.name || '尚未添加本地音乐'}</p><div><button aria-label={playing ? '暂停音乐' : '播放音乐'} disabled={ctx.busy || !ctx.canOutput || !music?.available} onClick={() => control(playing ? 'pause' : 'play')}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button><button aria-label="停止音乐" disabled={ctx.busy || !ctx.canOutput || !music?.available} onClick={() => control('stop')}><Square size={14}/></button></div></div>
    <details><summary>添加 / 更换音乐</summary><p>{outputs.length ? `请先停止：${outputs.join('、')}。` : '在停播窗口更换；新来源暂停、静音，初始增益 −18 dB。'}</p><input aria-label="节目音乐文件" type="file" accept=".mp3,.wav,.ogg,.flac" disabled={ctx.busy || uploading || !ctx.canOutput || !ctx.engine?.connected || outputs.length > 0} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }}/><small>MP3 / WAV / OGG / FLAC · 上限 32 MB</small></details>
    <small>播放直接进入 Program 混音，包含回放。</small>
  </section>;
}
