import { ResourceMaintenanceWorkspace } from '../components/ResourceMaintenanceWorkspace';
import { DraftStatisticsControls } from '../components/DraftStatistics';
import { TransitionControls } from '../components/TransitionControls';
import { sceneInfo } from '../lib';
import { VdoNinjaWorkspace } from '../components/VdoNinjaWorkspace';
import { DemoWorkspace } from '../components/DemoWorkspace';
import { GlobalShortcutControls } from '../components/GlobalShortcutControls';
import { TwitchAudienceWorkspace } from '../components/TwitchAudienceWorkspace';
import { IntegrationWorkspace } from '../components/IntegrationWorkspace';
import { CinematicWorkspace } from '../components/CinematicWorkspace';
import { BroadcastAnalysisControls } from '../components/BroadcastAnalysis';
import { CLIENT_POLL_MIN, CLIENT_POLL_MAX, normalizeClientPollInterval } from '../../shared/client-poll';
import {ProductionDesk} from '../components/ProductionDesk';
import {GraphicControls} from '../components/GraphicControls';
import {useConfigDraft} from '../useConfigDraft';
import { useEffect, useRef, useState } from 'react';
import { Activity, Check, Copy, ExternalLink, Layers, Monitor, Palette, Pause, Play, Plug, Radio, RefreshCw, Save, Settings2, Smartphone, Timer, Users, Volume2, Wifi } from 'lucide-react';
import type { BroadcastState, StateContext } from '../../shared/types';
import { api, outputUrl } from '../lib';
import { ReplayDiagnostics } from '../components/ReplayDiagnostics';
import { BroadcastLook } from '../components/BroadcastLook';
import { EconomySourcePanel } from '../components/EconomySourcePanel';
import { EmbeddedObs, type ObsEngineStatus } from '../components/EmbeddedObs';
import { NativeHudControls } from '../components/ObserverGraphics';
import { LiveBottomControls } from '../components/LiveBottomControls';
import { AppearanceSettings } from '../components/AppearanceSettings';
import './settings.css';

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

export type SettingsSection = 'data' | 'video' | 'audio' | 'output' | 'graphics' | 'appearance' | 'diagnostics' | 'collaboration' | 'cinematics' | 'integrations' | 'audience' | 'vdo' | 'demo' | 'transitions' | 'resources';
const settingsTasks: { id: SettingsSection; label: string; description: string; icon: typeof Plug }[] = [
  { id: 'data', label: '数据连接', description: '客户端、局内数据与本地回放', icon: Plug },
  { id: 'video', label: '画面', description: '引擎、游戏捕获与合成画面', icon: Monitor },
  { id: 'audio', label: '声音', description: '采集设备、通道混音与节目音乐', icon: Volume2 },
  { id: 'output', label: '输出', description: '信号路径、设备准备与独立启停', icon: Radio },
  { id: 'graphics', label: '节目包装', description: '比赛身份、HUD 与节目图层', icon: Layers },
  { id: 'diagnostics', label: '诊断', description: '采集来源、经济校准与回放控制', icon: Activity },
  { id: 'collaboration', label: '协作', description: '画面链接、移动接入与操作席位', icon: Users },
  { id: 'cinematics', label: '镜头制作', description: '样条轨迹、游戏内预览与手柄', icon: Monitor },
  { id: 'resources', label: '资源维护', description: '版本匹配、下载进度及缓存清理', icon: Layers },
  { id: 'transitions', label: '转场与事件', description: '硬切、淡化、视频转场及自动规则', icon: Layers },
  { id: 'vdo', label: '远程选手画面', description: 'VDO.Ninja 邀请与名单绑定', icon: Users },
  { id: 'demo', label: '图形演示', description: '独立样本预览', icon: Play },
  { id: 'audience', label: '观众互动', description: 'Twitch 投票、预测和聊天投票', icon: Users },
  { id: 'integrations', label: '数据集成', description: '只读数据接口与制作 Webhook', icon: Wifi },
  { id: 'appearance', label: '工作台外观', description: '操作界面主题与本机偏好', icon: Palette },
];

type Props = StateContext & { onOpenStudio?: () => void; outputReady?: boolean; onOutputReady?: (ready: boolean) => void; focusTask?:{section:SettingsSection;sequence:number} };
export function Settings({ state, send, notify, champions, seat, connected, onOpenStudio, outputReady, onOutputReady, focusTask }: Props) {
  const settingsDraft=useConfigDraft(state.settings,state.production?.configVersion),settings=settingsDraft.draft,setSettings=settingsDraft.setDraft;
  const [section, setSection] = useState<SettingsSection>('output');
  useEffect(()=>{if(focusTask)setSection(focusTask.section);},[focusTask]);
  const workspaceScroll = useRef<HTMLDivElement>(null);
  const operationActive = useRef(false);
  const [operationError, setOperationError] = useState('');
  const [operationReceipt, setOperationReceipt] = useState('');
  useEffect(() => { workspaceScroll.current?.scrollTo({ top: 0 }); }, [section]);
  const overlayDraft=useConfigDraft(state.overlay,state.production?.configVersion),overlay=overlayDraft.draft,setOverlay=overlayDraft.setDraft;
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
    if (operationActive.current) return;
    operationActive.current = true; setPending(key); setOperationError(''); setOperationReceipt('');
    try { await work(); if (message) { setOperationReceipt(message); notify(message); } }
    catch (error) { const text = errorMessage(error); setOperationError(text); notify(text, 'error'); }
    finally { operationActive.current = false; setPending(null); }
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
    if (operationActive.current) return;
    operationActive.current = true; setReplayError(''); setPending('replay-control');
    try { await request('/api/replay', patch); if (typeof patch.paused === 'boolean') setReplayPaused(patch.paused); notify('回放控制已发送'); }
    catch (error) { const message = errorMessage(error); setReplayError(message); notify(message, 'error'); }
    finally { operationActive.current = false; setPending(null); }
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); notify(`${label}已复制`); } catch { notify('浏览器未允许剪贴板访问，请选中链接手动复制'); }
  }
  const overlayUrl = outputUrl();
  const remoteUrl = `${window.location.origin}/remote`;
  const busy = pending !== null;
  const obsMode = obsEngine?.mode ?? 'embedded';
  const obsConnected = obsEngine?.connected ?? false;
  const currentTask = settingsTasks.find(task => task.id === section)!;
  const controlReason = connected === false ? '同步已中断，等待重新连接后再操作输出。'
    : seat && (seat.role !== 'director' || state.production?.control && state.production.control.owner !== seat.id)
      ? '由当前主导播 ' + (state.production?.control?.name || '控制席') + ' 操作引擎与输出。' : '';
  const engineActive = !!obsEngine?.streamActive || !!obsEngine?.recordActive || !!obsEngine?.virtualCamActive || !!obsEngine?.companionAudio?.active || !!obsEngine?.companionAudio?.managing;
  const saveSettings = () => run('save-settings', () => send({
    type: 'set-settings', expectedConfigVersion: settingsDraft.baseVersion.current,
    patch: { ...settings, pollInterval: normalizeClientPollInterval(settings.pollInterval) },
  }), '客户端设置已保存');
  const saveOverlay = () => run('save-overlay', () => send({
    type: 'set-overlay', expectedConfigVersion: overlayDraft.baseVersion.current, patch: overlay,
  }), '节目包装已保存到待播，核对预监后再整体切入');

  return <div className="settings-workspace">
    <aside className="settings-directory">
      <div className="settings-directory-title"><Settings2 size={18} /><strong>连接与输出</strong></div>
      <nav role="tablist" aria-orientation="vertical" aria-label="连接与输出任务">
        {settingsTasks.map((task, index) => <button key={task.id} id={'settings-nav-' + task.id} role="tab"
          aria-selected={section === task.id} aria-controls="settings-current-task" tabIndex={section === task.id ? 0 : -1}
          onClick={() => setSection(task.id)}
          onKeyDown={event => {
            const next = event.key === 'ArrowDown' ? (index + 1) % settingsTasks.length
              : event.key === 'ArrowUp' ? (index + settingsTasks.length - 1) % settingsTasks.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? settingsTasks.length - 1 : -1;
            if (next < 0) return;
            event.preventDefault(); setSection(settingsTasks[next].id);
            (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
          }}>
          <task.icon size={17} /><span>{task.label}</span>
          {(task.id === 'data' && settingsDraft.dirty || task.id === 'graphics' && overlayDraft.dirty) && <i aria-label="有本地修改" />}
        </button>)}
      </nav>
      <div className="settings-directory-footer">
        <span>{connected === false ? '同步中断' : '工作台已同步'}</span>
        <small>{state.production?.control?.name ? '当前控制：' + state.production.control.name : '主机工作台'}</small>
        {onOpenStudio && <button className="button small" onClick={onOpenStudio}>返回导播台</button>}
      </div>
    </aside>

    <section className="settings-task-workspace" id="settings-current-task" role="tabpanel" aria-labelledby={'settings-nav-' + section}>
      <header className="settings-task-heading"><div><h1>{currentTask.label}</h1><p>{currentTask.description}</p></div>
        {section === 'data' && <span className="settings-task-state">{'客户端实时数据'}</span>}
        {section === 'graphics' && <span className="settings-task-state">修改先进入待播</span>}
        {section === 'appearance' && <span className="settings-task-state">不改变节目画面</span>}
      </header>
      <div className="settings-task-scroll" ref={workspaceScroll}>
        {(settingsDraft.conflict || overlayDraft.conflict) && <div className="settings-conflict" role="alert">
          <strong>其他席位更新了配置，本地输入已保留</strong>
          <p>变化字段：{[...settingsDraft.changedFields, ...overlayDraft.changedFields].filter(key => key !== 'obsPassword').join('、') || '连接凭据或配置版本'}</p>
          <div><button className="button" onClick={() => { settingsDraft.discard(); overlayDraft.discard(); }}>采用最新配置</button><button className="button" onClick={() => { settingsDraft.rebase(); overlayDraft.rebase(); }}>核对后保留本地修改</button></div>
        </div>}
        {operationError && <p className="settings-operation-error" role="alert">{operationError}</p>}
        {operationReceipt && <p className="settings-operation-receipt" role="status">{operationReceipt}</p>}

        <div className="settings-task-pane" hidden={section !== 'data'}>
          <section className="settings-source-mode">
            <div><strong>数据来源</strong><p>{'读取本机客户端，进入游戏后再核对实时样本。'}</p></div>
<div className="settings-choice-group"><span className="badge"><Radio size={15} />客户端实时</span></div>
          </section>
          <section className="settings-connection-list" aria-label="数据连接状态">
            {connectionCards.map(({ target, name, subtitle, icon: Icon, note }) => <div className="settings-connection-row" key={target}>
              <Icon size={20} />
              <div><strong>{name}</strong><small>{subtitle}</small></div>
              <div className="settings-connection-detail"><span className={'settings-connection-state is-' + state.connections[target].status}>{connectionLabels[state.connections[target].status]}</span><p>{state.connections[target].detail || note}</p></div>
              <button className="button small" disabled={busy} onClick={() => connect(target)}><RefreshCw size={14} className={pending === target ? 'spinning' : ''} />{pending === target ? '正在连接…' : state.connections[target].status === 'connected' ? '重新连接' : '连接服务'}</button>
            </div>)}
          </section>
          <section className="settings-block">
            <header><h2>观战遥测</h2><p>自动补充技能冷却、生命、资源、经验与头像增益。连接完整观战数据后开始采样。</p></header>
            <p role="status">{state.observerTelemetry?.detail??'等待国服观战或回放'}</p>
            {state.observerTelemetry?.profile&&<small>匹配版本：{state.observerTelemetry.profile}</small>}
          </section>
          <section className="settings-block">
            <header><h2>本机客户端</h2><p>路径与轮询配置保存到本地服务；认证信息仅由本地服务读取。</p></header>
            <div className="settings-fields settings-two-column">
              <label className="field">LCU lockfile 路径<input maxLength={1024} value={settings.lockfilePath} onChange={event => setSettings({ ...settings, lockfilePath: event.target.value })} placeholder="留空自动查找，或填写完整路径" />
                {window.riftcastDesktop && <button className="button small" onClick={() => void window.riftcastDesktop!.choosePath('lockfile').then(path => { if (path) setSettings({ ...settings, lockfilePath: path }); }).catch(error => notify(error.message, 'error'))}>选择 lockfile</button>}
              </label>
              <label className="field">英雄联盟安装目录<input maxLength={1024} value={settings.gamePath} onChange={event => setSettings({ ...settings, gamePath: event.target.value })} placeholder="选择英雄联盟客户端的安装目录" /><small>用于查找本机 lockfile。</small>
                {window.riftcastDesktop && <button className="button small" onClick={() => void window.riftcastDesktop!.choosePath('game').then(path => { if (path) setSettings({ ...settings, gamePath: path }); }).catch(error => notify(error.message, 'error'))}>选择安装目录</button>}
              </label>
              <label className="field">客户端 API 轮询间隔（毫秒）<input type="number" min={CLIENT_POLL_MIN} max={CLIENT_POLL_MAX} step="100" value={settings.pollInterval} onChange={event => setSettings({ ...settings, pollInterval: Number(event.target.value) })} /><small>默认 500 毫秒，可调整为 100–1000 毫秒，保存后生效。接口响应较慢时会等待当前请求完成。</small></label>
              <label className="settings-toggle"><span>自动跟随比赛阶段<small>客户端阶段变化时更新工作台</small></span><input type="checkbox" checked={settings.autoPhase} onChange={event => setSettings({ ...settings, autoPhase: event.target.checked })} /></label>
            </div>
          </section>
        </div>

        <div className="settings-task-pane" hidden={!(['video', 'audio', 'output'] as string[]).includes(section)}>
          <EmbeddedObs notify={notify} onStatus={setObsEngine} onOpenStudio={onOpenStudio} onConnectExternal={() => connect('obs')}
            outputReady={outputReady} onOutputReady={onOutputReady} connectionBusy={busy} section={section} onSection={setSection} controlReason={controlReason} />
        </div>

        <div className="settings-task-pane" hidden={section !== 'video'}>
          {obsMode === 'external' && <section id="external-obs-setup" className="settings-block">
            <header><h2>外部 OBS 连接与场景</h2><p>在 OBS「工具 → WebSocket 服务器设置」启用服务，然后保存连接配置。</p></header>
            <div className="settings-external-layout">
              <div className="settings-fields">
                <label className="field">WebSocket 地址<input maxLength={200} value={settings.obsUrl} onChange={event => setSettings({ ...settings, obsUrl: event.target.value })} placeholder="ws://127.0.0.1:4455" /></label>
                <label className="field">服务器密码<input type="password" autoComplete="new-password" maxLength={300} value={settings.obsPassword || ''} onChange={event => setSettings({ ...settings, obsPassword: event.target.value })} placeholder="本次 OBS WebSocket 服务器密码" /></label>
                <button className="button primary" disabled={busy || !!controlReason} onClick={() => connect('obs')}><Plug size={14} />保存并连接外部 OBS</button>
              </div>
              <div className="settings-fields">
                <label className="field">外部 OBS 场景<div className="settings-inline-field"><select value={obsScene} disabled={!scenes.length} onChange={event => setObsScene(event.target.value)}><option value="">{scenes.length ? '选择场景' : '连接 OBS 后刷新场景'}</option>{scenes.map(scene => <option key={scene.sceneName} value={scene.sceneName}>{scene.sceneName}</option>)}</select><button className="button small" disabled={busy || !obsConnected} onClick={refreshScenes} aria-label="刷新外部 OBS 场景"><RefreshCw size={15} /></button></div></label>
                <div className="settings-actions"><button className="button" disabled={busy || !!controlReason || !obsScene || !obsConnected} onClick={() => run('switch-scene', async () => { await request('/api/obs/scene', { sceneName: obsScene }); }, 'OBS 已切换至 ' + obsScene)}>切换外部 OBS 场景</button><button className="button" disabled={busy || !!controlReason || !obsScene || !obsConnected || engineActive} onClick={() => void addExternalHud()}><Layers size={14} />{pending === 'add-hud' ? '正在添加…' : '添加 RiftCast HUD 来源'}</button></div>
                <p className="settings-note">HUD 画布为 1920 × 1080。场景切换即时影响外部 OBS；请先核对游戏捕获、系统声音与解说音频。</p>
              </div>
            </div>
          </section>}
        </div>

        <div className="settings-task-pane settings-mixer-pane" hidden={section !== 'audio'}>
          <ProductionDesk {...{ state, send, notify, champions, seat, connected }} initialTask="audio" allowedTasks={['audio']} />
        </div>

        {section === 'cinematics' && <div className="settings-task-pane"><GlobalShortcutControls {...{state,seat,connected,send,notify,champions}}/><CinematicWorkspace state={state} disabled={seat?.role!=='director'||state.production?.control?.owner!==seat.id}/></div>}
        {section === 'resources' && <div className="settings-task-pane"><ResourceMaintenanceWorkspace/></div>}
        {section === 'transitions' && <div className="settings-task-pane"><TransitionControls disabled={connected===false||seat?.role!=='director'||state.production?.control?.owner!==seat.id} value={state.broadcastTransitions} receipt={state.transitionReceipt} scenes={[...Object.entries(sceneInfo).map(([id,v])=>({id:id as import('../../shared/types').Scene,name:v.name})),...(state.customScenes??[]).map(s=>({id:s.id,name:s.name}))]} onSave={async value=>{await api('/api/transitions',{method:'POST',body:JSON.stringify(value)});notify('转场配置已保存');}}/></div>}
        {section === 'vdo' && <div className="settings-task-pane"><VdoNinjaWorkspace/></div>}
        {section === 'demo' && <div className="settings-task-pane"><DemoWorkspace state={state}/></div>}
        {section === 'audience' && <div className="settings-task-pane"><TwitchAudienceWorkspace/></div>}
        {section === 'integrations' && <div className="settings-task-pane"><IntegrationWorkspace disabled={seat?.role!=='director'||state.production?.control?.owner!==seat.id}/></div>}
        <div className="settings-task-pane" hidden={section !== 'graphics'}>
          <section className="settings-block"><header><h2>BP 与选手布局</h2></header><label className="field">BP 构图<select aria-label="BP 构图" value={overlay.draftLayout??'bottom'} onChange={e=>setOverlay({...overlay,draftLayout:e.target.value as 'bottom'|'full-height'})}><option value="bottom">底部横排</option><option value="full-height">全高双队</option></select></label><label className="settings-toggle"><span>双侧英雄状态栏<small>英雄、等级、生命资源、技能冷却、计分与复活倒计时</small></span><input type="checkbox" checked={!!overlay.championTabs} onChange={e=>setOverlay({...overlay,championTabs:e.target.checked})}/></label></section>
          <section className="settings-block settings-analysis-block"><header><h2>局内分析与事件图层</h2><p>保存到待播后，在导播台预监局内计分板并 TAKE。</p></header><BroadcastAnalysisControls mode={overlay.analysisMode??'off'} onModeChange={analysisMode=>setOverlay({...overlay,analysisMode})} killFeed={!!overlay.killFeed} onKillFeedChange={killFeed=>setOverlay({...overlay,killFeed})} announcer={!!overlay.announcer} onAnnouncerChange={announcer=>setOverlay({...overlay,announcer})} inhibitors={!!overlay.inhibitorTimers} onInhibitorsChange={inhibitorTimers=>setOverlay({...overlay,inhibitorTimers})}/><label className="settings-toggle"><span>L 形品牌框<small>内置 OBS 游戏画面等比缩放，左侧选手与底部品牌</small></span><input type="checkbox" checked={!!overlay.lFrame} onChange={e=>setOverlay({...overlay,lFrame:e.target.checked})}/></label><label className="settings-toggle"><span>完整顶部计分板<small>显示击杀、双方经济、资源与比赛时钟</small></span><input type="checkbox" checked={!!overlay.fullScoreboard} onChange={e=>setOverlay({...overlay,fullScoreboard:e.target.checked})}/></label></section>
          <section className="settings-block">
            <header><h2>ARENA 节目身份</h2><p>包装编辑保存后进入待播；在预监核对，再由主导播切入正式节目。</p></header>
            <div className="settings-look"><BroadcastLook {...{ state, champions, send, notify }} /></div>
            <div className="settings-fields settings-two-column">
              <div className="settings-toggle-list">
                {([{ key: 'objectives', name: '地图资源', note: '顶部显示防御塔、巨龙与男爵' }, { key: 'goldDiff', name: '经济差', note: '数据可用时显示双方经济' }] as const).map(item => <label className="settings-toggle" key={item.key}><span>{item.name}<small>{item.note}</small></span><input type="checkbox" checked={overlay[item.key]} onChange={event => setOverlay({ ...overlay, [item.key]: event.target.checked })} /></label>)}
              </div>
              <div className="settings-field-stack">
                <label className="field">品牌强调色<div className="settings-color-field"><input type="color" value={overlay.accent} onChange={event => setOverlay({ ...overlay, accent: event.target.value })} /><span>{overlay.accent.toUpperCase()}</span></div></label>
                <label className="field">HUD 缩放：{Math.round(overlay.scale * 100)}%<input type="range" min="0.5" max="2" step="0.05" value={overlay.scale} onChange={event => setOverlay({ ...overlay, scale: Number(event.target.value) })} /></label>
              </div>
              <label className="field">赞助商 / 品牌名称<input maxLength={80} value={overlay.sponsor} onChange={event => setOverlay({ ...overlay, sponsor: event.target.value })} placeholder="填写赞助商或赛事品牌" /></label>
              <label className="field">赞助商图片<select value={overlay.sponsorLogo || ''} onChange={event => setOverlay({ ...overlay, sponsorLogo: event.target.value })}><option value="">使用品牌文字</option>{state.assets.map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}</select><small>图片来自赛事素材库；保存后进入待播。</small></label>
              <label className="field settings-span-all">底部公告<textarea rows={3} maxLength={500} value={overlay.tickerText} onChange={event => setOverlay({ ...overlay, tickerText: event.target.value })} placeholder="填写本场赛事的公告内容" /></label>
            </div>
          </section>
          <section className="settings-block">
            <header><h2>赛前倒计时</h2><p>倒计时单独提交；按既有待播与切入流程核对节目。</p></header>
            <div className="settings-countdown">
              <label className="field">时长（秒）<input type="number" min="1" max="86400" value={countdown} onChange={event => setCountdown(Number(event.target.value))} /></label>
              <button className="button" disabled={busy} onClick={() => run('countdown', () => send({ type: 'set-overlay', patch: { countdownEnd: Date.now() + Math.max(1, Math.min(86400, countdown || 180)) * 1000 } }), '赛前倒计时已开始')}><Timer size={14} />开始倒计时</button>
              <button className="button" disabled={busy || !state.overlay.countdownEnd} onClick={() => run('countdown-clear', () => send({ type: 'set-overlay', patch: { countdownEnd: null } }), '倒计时已清除')}>清除</button>
              <span>{state.overlay.countdownEnd ? '结束时间 ' + new Date(state.overlay.countdownEnd).toLocaleTimeString('zh-CN') : '尚未启动倒计时'}</span>
            </div>
          </section>
          <LiveBottomControls {...{ state, champions, send, notify }} />
          <NativeHudControls {...{ state, champions, send, notify }} />
          <DraftStatisticsControls {...{ state, send, notify, seat, connected }} />
          <GraphicControls {...{ state, send, notify, champions }} />
        </div>

        <div className="settings-task-pane" hidden={section !== 'diagnostics'}>
          <div className="settings-diagnostic-layout">
            <ReplayDiagnostics status={state.connections.replay.status} />
            <section className="settings-block">
              <header><h2>回放控制</h2><p>控制本机 Replay API；修改即时作用于当前录像回放。</p></header>
              <div className="settings-fields">
                <div className="settings-actions"><button className="button" disabled={busy || state.connections.replay.status !== 'connected'} onClick={() => replay({ paused: !replayPaused })}>{replayPaused ? <Play size={15} /> : <Pause size={15} />}{replayPaused ? '继续播放' : '暂停回放'}</button></div>
                <label className="field">回放倍速<div className="settings-inline-field"><select aria-label="回放倍速" value={speed} onChange={event => setSpeed(event.target.value)}>{['0.25', '0.5', '1', '2', '4', '8'].map(value => <option value={value} key={value}>{value} ×</option>)}</select><button className="button" disabled={busy || state.connections.replay.status !== 'connected'} onClick={() => replay({ speed: Number(speed) })}>应用倍速</button></div></label>
                <label className="field">跳转到（秒）<div className="settings-inline-field"><input type="number" min="0" step="1" value={seekTime} onChange={event => setSeekTime(event.target.value)} placeholder="600 = 10:00" /><button className="button" disabled={busy || seekTime === '' || state.connections.replay.status !== 'connected'} onClick={() => replay({ time: Math.max(0, Number(seekTime)) })}>跳转</button></div></label>
                {replayError && <p className="settings-operation-error" role="alert">{replayError}</p>}
                <p className="settings-note">Replay API 未启用时，先按诊断建议处理，再返回数据连接重新连接。</p>
              </div>
            </section>
          </div>
          <EconomySourcePanel {...{ state, notify }} />
        </div>

        <div className="settings-task-pane" hidden={section !== 'collaboration'}>
          <section className="settings-block">
            <header><h2>画面链接与移动接入</h2><p>内置引擎自动加载 HUD；外部 OBS 可使用画面链接，协作席位从遥控页面进入。</p></header>
            <div className="settings-access-links">
              <div><strong><Monitor size={16} />HUD 浏览器画面</strong><code>{overlayUrl}</code><div className="settings-actions"><button className="button small" onClick={() => copy(overlayUrl, '画面链接')}><Copy size={13} />复制链接</button><a className="button small" href={overlayUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />打开画面</a></div></div>
              <div><strong><Smartphone size={16} />本机遥控页面</strong><code>{remoteUrl}</code><div className="settings-actions"><button className="button small" onClick={() => copy(remoteUrl, '遥控链接')}><Copy size={13} />复制链接</button><a className="button small" href={remoteUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} />打开遥控</a></div></div>
            </div>
            <div className="settings-network">
              <div className="settings-network-heading"><Wifi size={17} /><strong>局域网多设备协作</strong><span>{network ? network.enabled ? '已启用' : '未启用' : '状态待查询'}</span><button className="button small" disabled={busy} onClick={() => run('network', async () => { setNetwork(await request<NetworkInfo>('/api/network')); }, '网络信息已刷新')}><RefreshCw size={13} />刷新网络信息</button></div>
              {network?.enabled && network.urls.length ? <><div className="settings-lan-list">{network.urls.map(url => {
                const base = url.replace(/\/$/, '');
                const remote = (base.endsWith('/remote') ? base : base + '/remote') + (network.controlToken ? '?token=' + encodeURIComponent(network.controlToken) : '');
                return <div key={url}><code>{url}</code><button className="button small" onClick={() => copy(remote, '手机遥控链接')}><Copy size={13} />复制遥控链接</button></div>;
              })}</div><p className="settings-note">手机与主机连接同一网络。复制的遥控链接包含控制令牌，仅分享给导播团队。</p></> : <p className="settings-note">{network ? '当前未提供可用的局域网地址。源码运行时可通过 ENABLE_LAN=1 启动服务；局域网控制仍需令牌和已授权席位。' : '网络信息尚未读取，请刷新后核对。'}</p>}
            </div>
          </section>
          <ProductionDesk {...{ state, send, notify, champions, seat, connected }} initialTask="seats" allowedTasks={['prepare', 'seats']} />
        </div>

        <div className="settings-task-pane" hidden={section !== 'appearance'}><AppearanceSettings /></div>
      </div>

      {section === 'data' && <footer className="settings-savebar"><div><strong>{settingsDraft.dirty ? '客户端配置有未保存修改' : '客户端配置已同步'}</strong><small>连接服务时会一并提交当前客户端设置</small></div><button className="button" disabled={!settingsDraft.dirty || busy} onClick={settingsDraft.discard}>放弃修改</button><button className="button primary" disabled={!settingsDraft.dirty || busy} onClick={() => void saveSettings()}><Save size={14} />{pending === 'save-settings' ? '保存中…' : '保存客户端设置'}</button></footer>}
      {section === 'graphics' && <footer className="settings-savebar"><div><strong>{overlayDraft.dirty ? '包装有未保存修改' : '包装与待播配置一致'}</strong><small>保存不改变正在播出的节目</small></div><button className="button" disabled={!overlayDraft.dirty || busy} onClick={overlayDraft.discard}>放弃修改</button><button className="button primary" disabled={!overlayDraft.dirty || busy} onClick={() => void saveOverlay()}><Save size={14} />{pending === 'save-overlay' ? '保存中…' : '保存到待播'}</button></footer>}
    </section>
  </div>;
}
