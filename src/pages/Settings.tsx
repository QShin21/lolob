import {TaskTabs,SaveBar} from '../components/ConsoleUI';
import {ProductionDesk} from '../components/ProductionDesk';
import {GraphicControls} from '../components/GraphicControls';
import {useConfigDraft} from '../useConfigDraft';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, Layers, Link, Monitor, Pause, Play, Plug, Radio, RefreshCw, Save, Settings2, Smartphone, Timer, Wifi } from 'lucide-react';
import type { BroadcastState, OverlaySettings, StateContext } from '../../shared/types';
import { api, outputUrl } from '../lib';
import { ReplayDiagnostics } from '../components/ReplayDiagnostics';
import { BroadcastLook } from '../components/BroadcastLook';
import { EconomySourcePanel } from '../components/EconomySourcePanel';
import { EmbeddedObs, type ObsEngineStatus } from '../components/EmbeddedObs';
import { NativeHudControls } from '../components/ObserverGraphics';
import { LiveBottomControls } from '../components/LiveBottomControls';
import { AppearanceSettings } from '../components/AppearanceSettings';
import './management.css';

type Target = keyof BroadcastState['connections'];
type NetworkInfo = { enabled: boolean; urls: string[]; controlToken?: string };
type ObsScene = { sceneName: string };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败，请检查服务连接';
const connectionLabels = { connected: '已连接', disconnected: '未连接', connecting: '连接中', error: '连接失败' };
const connectionCards: { target: Target; name: string; subtitle: string; icon: typeof Plug; note: string }[] = [
  { target: 'lcu', name: 'League Client', subtitle: '客户端 · BP / 比赛阶段', icon: Plug, note: '打开英雄联盟客户端后连接，可自动发现本地 lockfile。' },
  { target: 'live', name: 'Live Client Data', subtitle: '局内数据 · 端口 2999', icon: Radio, note: '进入本地游戏或观战后连接，字段以客户端实际返回为准。' },
  { target: 'replay', name: 'Replay API', subtitle: '回放 · 暂停 / 倍速 / 跳转', icon: Play, note: '打开录像回放，并在游戏配置中启用 Replay API。' },
];
async function request<T = Record<string, unknown>>(url: string, body?: Record<string, unknown>): Promise<T> {
  return api<T>(url, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);
}

type Props = StateContext & { onOpenStudio?: () => void; outputReady?: boolean; onOutputReady?: (ready: boolean) => void };
export function Settings({ state, send, notify, champions, onOpenStudio, outputReady, onOutputReady }: Props) {
  const settingsDraft=useConfigDraft(state.settings,state.production?.configVersion),settings=settingsDraft.draft,setSettings=settingsDraft.setDraft;
  const [section,setSection]=useState<'data'|'video'|'audio'|'output'|'graphics'|'appearance'|'diagnostics'>('data');
  const overlayDraft=useConfigDraft(state.overlay,state.production?.configVersion),overlay=overlayDraft.draft,setOverlay=overlayDraft.setDraft;
  const remoteOverlay = useRef<OverlaySettings>({...state.overlay});
  const [pending, setPending] = useState<string | null>(null);
  const [scenes, setScenes] = useState<ObsScene[]>([]);
  const [obsScene, setObsScene] = useState('');
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [countdown, setCountdown] = useState(180);
  const [speed, setSpeed] = useState('1');
  const [seekTime, setSeekTime] = useState('');
  const [replayPaused, setReplayPaused] = useState(false);
  const [replayError, setReplayError] = useState('');
  const [obsEngine, setObsEngine] = useState<ObsEngineStatus | null>(null);
  useEffect(() => { void request<NetworkInfo>('/api/network').then(setNetwork).catch(() => setNetwork(null)); }, []);
  useEffect(() => {
    if (!(obsEngine?.connected ?? state.connections.obs.status === 'connected')) { setScenes([]); setObsScene(''); return; }
    let active = true;
    void request<{ scenes: ObsScene[]; currentProgramSceneName: string }>('/api/obs/scenes').then(result => { if (active) { setScenes(result.scenes || []); setObsScene(result.currentProgramSceneName || ''); } }).catch(() => {});
    return () => { active = false; };
  }, [obsEngine?.connected, obsEngine?.mode, state.connections.obs.status]);
  async function run(key: string, work: () => Promise<void>, message?: string) {
    setPending(key);
    try { await work(); if (message) notify(message); } catch (error) { notify(errorMessage(error),'error'); } finally { setPending(null); }
  }
  async function connect(target: Target) {
    await run(target, async () => {
      await send({ type: 'set-settings', expectedConfigVersion:settingsDraft.baseVersion.current, patch: settings });
      const result = await request<BroadcastState>('/api/connect', { target });
      const connection = result.connections[target];
      if (connection.status === 'connected') notify(`${connectionCards.find(card => card.target === target)?.name || '外部 OBS'} 已连接`);
      else notify(connection.detail || '连接请求已处理，等待客户端就绪');
      if (target === 'obs' && connection.status === 'connected') setSettings(draft => { const next = { ...draft }; delete next.obsPassword; return next; });
    });
  }
  async function addExternalHud() {
    await run('add-hud', async () => {
      const result = await request<{ sceneName: string; inputName: string; reused: boolean }>('/api/obs/hud', { sceneName: obsScene });
      notify(`${result.reused ? '已复用' : '已添加'} RiftCast HUD · ${result.sceneName}`);
    });
  }
  async function refreshScenes() {
    await run('scenes', async () => { const result = await request<{ scenes: ObsScene[]; currentProgramSceneName: string }>('/api/obs/scenes'); setScenes(result.scenes || []); setObsScene(result.currentProgramSceneName || ''); }, 'OBS 场景列表已更新');
  }
  async function replay(patch: Record<string, unknown>) {
    setReplayError('');
    setPending('replay-control');
    try { await request('/api/replay', patch); if (typeof patch.paused === 'boolean') setReplayPaused(patch.paused); notify('回放控制已发送'); } catch (error) { const message = errorMessage(error); setReplayError(message); notify(message,'error'); } finally { setPending(null); }
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); notify(`${label}已复制`); } catch { notify('浏览器未允许剪贴板访问，请选中链接手动复制'); }
  }
  const overlayUrl = outputUrl();
  const remoteUrl = `${window.location.origin}/remote`;
  const busy = pending !== null;
  const obsMode = obsEngine?.mode ?? 'embedded';
  const obsConnected = obsEngine?.connected ?? false;
  return <div className="settings-page">
    <div className="settings-workflow-heading"><div><span className="section-eyebrow">开播准备 · 连接与输出</span><h2>连接数据，准备播出</h2><p className="muted">当前赛事：{state.match.title} · 第 {state.match.game} 局。先选择数据来源，再完成 OBS 配置并返回导播台。</p></div>{onOpenStudio && <button className="button small" onClick={onOpenStudio}>返回导播台<ArrowRight size={15} /></button>}</div>
    <div className="settings-section-nav"><TaskTabs items={[{id:'data',label:'数据'},{id:'video',label:'画面'},{id:'audio',label:'声音'},{id:'output',label:'输出'},{id:'graphics',label:'包装'},{id:'appearance',label:'外观'},{id:'diagnostics',label:'诊断 / 协作'}]} value={section} onChange={setSection} label="设置分类"/></div>
    <div hidden={section!=='appearance'}><AppearanceSettings /></div>
    {(settingsDraft.conflict||overlayDraft.conflict)&&<div className="editor-draft-note" role="alert"><p>其他席位更新了配置。本地输入已保留。变化字段：{[...settingsDraft.changedFields,...overlayDraft.changedFields].filter(k=>k!=='obsPassword').join('、')}</p><button className="button" onClick={()=>{settingsDraft.discard();overlayDraft.discard();}}>采用最新配置</button><button className="button" onClick={()=>{settingsDraft.rebase();overlayDraft.rebase();}}>核对后保留本地修改</button></div>}
<div hidden={section!=='data'}>    <section className="panel mode-panel"><div><h2>数据来源</h2><p className="muted">演示模式可离线体验完整导播流程；实时模式读取本机客户端。</p></div><div className="mode-switch"><button className={state.mode === 'demo' ? 'active' : ''} disabled={busy} onClick={() => run('mode', () => send({ type: 'set-mode', mode: 'demo' }), '已切换到演示模式')}><Play size={15} />演示数据{state.mode === 'demo' && <Check size={14} />}</button><button className={state.mode === 'live' ? 'active' : ''} disabled={busy} onClick={() => run('mode', () => send({ type: 'set-mode', mode: 'live' }), '已切换到实时模式')}><Radio size={15} />客户端实时{state.mode === 'live' && <Check size={14} />}</button></div></section>
    <div className="connection-card-grid client-connection-card-grid">{connectionCards.map(({ target, name, subtitle, icon: Icon, note }) => <section className="panel connection-card" key={target}><div className="connection-card-title"><span className="connection-icon"><Icon size={21} /></span><span className={`connection-status ${state.connections[target].status}`}><i />{connectionLabels[state.connections[target].status]}</span></div><h3>{name}</h3><small>{subtitle}</small><p className="muted">{note}</p><div className="connection-detail" title={state.connections[target].detail}>{state.connections[target].detail || '等待连接'}</div><button className="button small" disabled={busy} onClick={() => connect(target)}><RefreshCw size={14} className={pending === target ? 'spinning' : ''} />{pending === target ? '正在连接…' : state.connections[target].status === 'connected' ? '重新连接' : '连接服务'}</button></section>)}</div>
<section className="panel"><div className="panel-head"><div><h2>本机客户端</h2><p className="muted">适用于 Windows 国服自定义比赛与本地观战。</p></div></div><div className="settings-form"><label className="field">LCU lockfile 路径<input maxLength={1024} value={settings.lockfilePath} onChange={event => setSettings({ ...settings, lockfilePath: event.target.value })} placeholder="留空自动查找；也可填写 lockfile 完整路径" /><small className="muted">认证信息仅由本地服务读取。</small>{window.riftcastDesktop&&<button className="button small" onClick={()=>void window.riftcastDesktop!.choosePath('lockfile').then(path=>{if(path)setSettings({...settings,lockfilePath:path});}).catch(e=>notify(e.message,'error'))}>选择 lockfile</button>}</label><label className="field">英雄联盟安装目录<input maxLength={1024} value={settings.gamePath} onChange={event => setSettings({ ...settings, gamePath: event.target.value })} placeholder="例如 D:\WeGameApps\英雄联盟" /><small className="muted">填写客户端安装目录，用于查找 lockfile。</small>{window.riftcastDesktop&&<button className="button small" onClick={()=>void window.riftcastDesktop!.choosePath('game').then(path=>{if(path)setSettings({...settings,gamePath:path});}).catch(e=>notify(e.message,'error'))}>选择安装目录</button>}</label><div className="form-grid"><label className="field">轮询间隔（毫秒）<input type="number" min="500" max="10000" step="250" value={settings.pollInterval} onChange={event => setSettings({ ...settings, pollInterval: Number(event.target.value) })} /></label><label className="toggle-setting"><span>自动跟随比赛阶段<small>客户端阶段变化时更新工作台</small></span><input type="checkbox" checked={settings.autoPhase} onChange={event => setSettings({ ...settings, autoPhase: event.target.checked })} /></label></div><button className="button primary small" disabled={busy} onClick={() => run('save-settings', () => send({ type: 'set-settings', expectedConfigVersion:settingsDraft.baseVersion.current, patch: { ...settings, pollInterval: Math.min(10000, Math.max(500, settings.pollInterval || 1000)) } }), '客户端设置已保存')}><Save size={14} />保存设置</button></div></section>
</div>
<div hidden={!(['video','audio','output'] as string[]).includes(section)}><EmbeddedObs notify={notify} onStatus={setObsEngine} onOpenStudio={onOpenStudio} onConnectExternal={() => connect('obs')} outputReady={outputReady} onOutputReady={onOutputReady} connectionBusy={busy} section={section} onSection={setSection}/></div>
<div hidden={section!=='video'}>      {obsMode === 'external' && <details id="external-obs-setup" className="panel external-obs-advanced" open><summary>外部 OBS 连接与场景</summary><div className="settings-form"><p className="muted management-note">在外部 OBS「工具 → WebSocket 服务器设置」启用服务后，填写对应地址与密码。</p><label className="field">WebSocket 地址<input maxLength={200} value={settings.obsUrl} onChange={event => setSettings({ ...settings, obsUrl: event.target.value })} placeholder="ws://127.0.0.1:4455" /></label><label className="field">服务器密码<input type="password" autoComplete="new-password" maxLength={300} value={settings.obsPassword || ''} onChange={event => setSettings({ ...settings, obsPassword: event.target.value })} placeholder="OBS WebSocket 服务器密码" /></label><button className="button primary small" disabled={busy} onClick={() => connect('obs')}><Plug size={14} />保存并连接外部 OBS</button><div className="settings-divider" /><label className="field">外部 OBS 场景<div className="scene-select-row"><select value={obsScene} disabled={!scenes.length} onChange={event => setObsScene(event.target.value)}><option value="">{scenes.length ? '选择场景' : '连接外部 OBS 后刷新场景'}</option>{scenes.map(scene => <option key={scene.sceneName} value={scene.sceneName}>{scene.sceneName}</option>)}</select><button className="button small" disabled={busy || !obsConnected} onClick={refreshScenes} aria-label="刷新外部 OBS 场景"><RefreshCw size={15} /></button></div></label><button className="button small" disabled={busy || !obsScene || !obsConnected} onClick={() => run('switch-scene', async () => { await request('/api/obs/scene', { sceneName: obsScene }); }, `OBS 已切换至 ${obsScene}`)}>切换外部 OBS 场景<ChevronRightIcon /></button><button className="button small" disabled={busy || !obsScene || !obsConnected || !!obsEngine?.streamActive} onClick={() => void addExternalHud()}><Layers size={14} />{pending === 'add-hud' ? '正在添加…' : '添加 RiftCast HUD 来源'}</button><p className="muted management-note">HUD 画布为 1920 × 1080。在外部 OBS 的同一场景准备游戏捕获、系统声音与解说音频。</p></div></details>}
</div>
<div hidden={section!=='audio'}><ProductionDesk {...{state,send,notify,champions}} initialTask="audio" allowedTasks={['audio']}/></div>
<div hidden={section!=='graphics'}><section className="panel arena-output-panel"><div className="panel-head"><div><h2>ARENA 播出配置</h2><p className="muted">统一赛事视觉，保留更多游戏视野。修改先保存到待播，核对预监后整体切入。</p></div><Settings2 size={19} /></div><div className="settings-form"><BroadcastLook {...{state,champions,send,notify}}/><div className="overlay-toggle-list">{([{ key: 'objectives', name: '地图资源', note: '顶部显示防御塔、巨龙与男爵' }, { key: 'goldDiff', name: '经济差', note: '数据可用时显示双方经济' }] as const).map(item => <label className="toggle-setting" key={item.key}><span>{item.name}<small>{item.note}</small></span><input type="checkbox" checked={overlay[item.key]} onChange={event => setOverlay({ ...overlay, [item.key]: event.target.checked })} /></label>)}</div><div className="form-grid"><label className="field">品牌强调色<div className="color-field"><input type="color" value={overlay.accent} onChange={event => setOverlay({ ...overlay, accent: event.target.value })} /><span>{overlay.accent.toUpperCase()}</span></div></label><label className="field">HUD 缩放 <span className="range-value">{Math.round(overlay.scale * 100)}%</span><input type="range" min="0.5" max="2" step="0.05" value={overlay.scale} onChange={event => setOverlay({ ...overlay, scale: Number(event.target.value) })} /></label></div><label className="field">赞助商 / 品牌名称<input maxLength={80} value={overlay.sponsor} onChange={event => setOverlay({ ...overlay, sponsor: event.target.value })} placeholder="填写赞助商或赛事品牌" /></label><label className="field">赞助商图片<select value={overlay.sponsorLogo || ""} onChange={event => setOverlay({ ...overlay, sponsorLogo: event.target.value })}><option value="">使用品牌文字</option>{state.assets.map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}</select><small className="muted">在图片素材中上传标志后选择，保存后进入待播，整体切入后进入节目。</small></label><label className="field">底部公告<textarea rows={3} maxLength={500} value={overlay.tickerText} onChange={event => setOverlay({ ...overlay, tickerText: event.target.value })} placeholder="例如：欢迎收看校园杯决赛" /></label><button className="button primary small" disabled={busy} onClick={() => run('save-overlay', () => send({ type: 'set-overlay', expectedConfigVersion:overlayDraft.baseVersion.current, patch: overlay }), 'ARENA 播出配置已保存')}><Save size={14} />保存播出配置</button><div className="settings-divider" /><label className="field">赛前倒计时（秒）<div className="scene-select-row"><input type="number" min="1" max="86400" value={countdown} onChange={event => setCountdown(Number(event.target.value))} /><button className="button small" disabled={busy} onClick={() => run('countdown', () => send({ type: 'set-overlay', patch: { countdownEnd: Date.now() + Math.max(1, Math.min(86400, countdown || 180)) * 1000 } }), '赛前倒计时已开始')}><Timer size={14} />开始</button></div></label><div className="countdown-state"><span className="muted">{state.overlay.countdownEnd ? `结束时间 ${new Date(state.overlay.countdownEnd).toLocaleTimeString('zh-CN')}` : '尚未启动倒计时'}</span><button className="button small" disabled={busy || !state.overlay.countdownEnd} onClick={() => run('countdown-clear', () => send({ type: 'set-overlay', patch: { countdownEnd: null } }), '倒计时已清除')}>清除</button></div></div></section>
      <LiveBottomControls {...{state,champions,send,notify}}/><NativeHudControls {...{state,champions,send,notify}}/><GraphicControls {...{state,send,notify,champions}}/></div>
<div hidden={section!=='diagnostics'}>    <section className="settings-diagnostics"><div><ReplayDiagnostics status={state.connections.replay.status}/><EconomySourcePanel {...{state,notify}}/></div></section>
      <section className="panel"><div className="panel-head"><div><h2>回放控制</h2><p className="muted">调用本机 Replay API，控制已启用 Replay API 的录像回放。</p></div><Play size={19} /></div><div className="settings-form"><div className="replay-control-row"><button className="button small" disabled={busy || state.connections.replay.status !== 'connected'} onClick={() => replay({ paused: !replayPaused })}>{replayPaused ? <Play size={15} /> : <Pause size={15} />}{replayPaused ? '继续播放' : '暂停回放'}</button><select aria-label="回放倍速" value={speed} onChange={event => setSpeed(event.target.value)}>{['0.25', '0.5', '1', '2', '4', '8'].map(value => <option value={value} key={value}>{value} ×</option>)}</select><button className="button small" disabled={busy || state.connections.replay.status !== 'connected'} onClick={() => replay({ speed: Number(speed) })}>应用倍速</button></div><label className="field">跳转到（秒）<div className="scene-select-row"><input type="number" min="0" step="1" value={seekTime} onChange={event => setSeekTime(event.target.value)} placeholder="例如 600，跳转到 10:00" /><button className="button small" disabled={busy || seekTime === '' || state.connections.replay.status !== 'connected'} onClick={() => replay({ time: Math.max(0, Number(seekTime)) })}>跳转</button></div></label>{replayError && <p className="request-error">{replayError}</p>}<p className="muted management-note">回放 API 未启用时会返回具体错误；开启功能后重新连接。</p></div></section>
    <section className="panel output-links-panel"><div className="panel-head"><div><h2>画面链接与遥控</h2><p className="muted">内置引擎自动加载 HUD；画面链接可用于外部 OBS 与预览。</p></div><Link size={19} /></div><div className="settings-form"><div className="output-link"><span><Monitor size={16} />HUD 浏览器画面</span><code>{overlayUrl}</code><div><button className="button small" onClick={() => copy(overlayUrl, '画面链接')}><Copy size={13} />复制链接</button><a className="button small" href={overlayUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />打开画面</a></div></div><div className="output-link"><span><Smartphone size={16} />本机遥控页面</span><code>{remoteUrl}</code><div><button className="button small" onClick={() => copy(remoteUrl, '遥控链接')}><Copy size={13} />复制链接</button><a className="button small" href={remoteUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />打开遥控</a></div></div><div className="settings-divider" /><div className="lan-title"><Wifi size={17} /><strong>局域网多设备协作</strong><span className={`badge ${network?.enabled ? 'connected' : ''}`}>{network?.enabled ? '已启用' : '未启用'}</span></div>{network?.enabled && network.urls.length ? <div className="lan-url-list">{network.urls.map(url => { const remote = `${url.replace(/\/$/, '').endsWith('/remote') ? url.replace(/\/$/, '') : url.replace(/\/$/, '') + '/remote'}${network.controlToken ? `?token=${encodeURIComponent(network.controlToken)}` : ''}`; return <div key={url}><code>{url}</code><button className="button small" onClick={() => copy(remote, '手机遥控链接')}><Copy size={13} />复制遥控链接</button></div>; })}<p className="muted management-note">手机与电脑连接同一网络。遥控链接包含控制令牌，请仅分享给导播团队。</p></div> : <p className="muted management-note">先以环境变量 <code>ENABLE_LAN=1</code> 启动服务，再使用手机访问本机的局域网地址。局域网控制需要令牌认证。</p>}<button className="button small" disabled={busy} onClick={() => run('network', async () => { setNetwork(await request<NetworkInfo>('/api/network')); }, '网络信息已刷新')}><RefreshCw size={13} />刷新网络信息</button></div></section><ProductionDesk {...{state,send,notify,champions}} initialTask="prepare" allowedTasks={['prepare','seats']}/></div>
{section==='data'&&<SaveBar dirty={settingsDraft.dirty} busy={busy} onDiscard={settingsDraft.discard} onSave={()=>void run('save-settings',()=>send({type:'set-settings',expectedConfigVersion:settingsDraft.baseVersion.current,patch:settings}),'客户端设置已保存')}/>}
{section==='graphics'&&<SaveBar dirty={overlayDraft.dirty} busy={busy} onDiscard={overlayDraft.discard} onSave={()=>void run('save-overlay',()=>send({type:'set-overlay',expectedConfigVersion:overlayDraft.baseVersion.current,patch:overlay}),'包装已保存到待播')}/>}
</div>;
}
function ChevronRightIcon() { return <span aria-hidden="true">→</span>; }
