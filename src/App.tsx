import { lazy, Suspense, useEffect, useState } from 'react';
import { Activity, Archive, CircleHelp, LayoutDashboard, Moon, Settings2, Sun, Swords, Trophy, Wifi } from 'lucide-react';
import { useBroadcast } from './useBroadcast';
import { useUiTheme } from './ui-theme';
import { getTeam } from './lib';
import { programState } from '../shared/production';
import { Brand } from './components/Icons';
import { Notification } from './components/ConsoleUI';
import { SeatRecovery } from './components/SeatRecovery';
import { ProductionBar } from './components/ProductionDesk';
import { BroadcastCanvas } from './components/BroadcastCanvas';
import { GameClockConnectionProvider } from './components/GameTime';
import { useDirectorKeys } from './components/useDirectorKeys';
import { WrapUp, type WorkflowPage } from './components/DirectorWorkflow';
import { Studio } from './pages/Studio';
import { Remote } from './pages/Remote';
import { Help } from './pages/Help';
import { version } from '../package.json';
import { loadStylePack } from './components/useStylePack';
import type { SettingsSection } from './pages/Settings';
const Draft = lazy(() => import('./pages/Draft').then(m => ({ default: m.Draft })));
const LiveData = lazy(() => import('./pages/LiveData').then(m => ({ default: m.LiveData })));
const Management = lazy(() => import('./pages/Management').then(m => ({ default: m.Management })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const navigation = [
  { id: 'studio', label: '导播台', name: '导播工作台', icon: LayoutDashboard },
  { id: 'draft', label: 'BP 阵容', name: 'BP 与阵容', icon: Swords },
  { id: 'data', label: '数据', name: '实时数据', icon: Activity },
  { id: 'manage', label: '赛事', name: '赛事与素材', icon: Trophy },
  { id: 'settings', label: '输出', name: '连接与输出', icon: Settings2 },
  { id: 'wrap', label: '收尾', name: '赛后收尾', icon: Archive },
  { id: 'help', label: '帮助', name: '使用指南', icon: CircleHelp },
] as const;
const readPage = (): WorkflowPage => {
  const hash = location.hash.slice(1);
  return navigation.some(item => item.id === hash) ? hash as WorkflowPage : 'studio';
};

export default function App() {
  const broadcast = useBroadcast();
  const { state, champions, connected, error, toast, notify, send, seat, lastSeat, seatStatus, seatError, recoverSeat, dismissNotice } = broadcast;
  const { theme, setTheme } = useUiTheme();
  const [page, updatePage] = useState<WorkflowPage>(readPage);
  const [visited, setVisited] = useState<Set<WorkflowPage>>(() => new Set([readPage()]));
  const [streamReady, setStreamReady] = useState(false);
  const [settingsFocus,setSettingsFocus]=useState<{section:SettingsSection;sequence:number}>();
  const [draftFocus,setDraftFocus]=useState<{task:'rules';sequence:number}>();
  const [managementTab, setManagementTab] = useState<'schedule' | 'recordings'>('schedule');
  const output = location.pathname.startsWith('/overlay'), remote = location.pathname.startsWith('/remote');
  const setPage = (next: WorkflowPage) => {
    updatePage(next); setVisited(value => new Set([...value, next]));
    history.replaceState(null, '', `${location.pathname}${location.search}#${next}`);
  };
  const navigate = (next: WorkflowPage) => { if (next === 'manage') setManagementTab('schedule'); setPage(next); };
  const records = () => { setManagementTab('recordings'); setPage('manage'); };
  const guideNavigate = (next:WorkflowPage,section?:SettingsSection) => { if(section)setSettingsFocus(old=>({section,sequence:(old?.sequence??0)+1}));navigate(next); };
  const newSeries = () => {setDraftFocus(old=>({task:'rules',sequence:(old?.sequence??0)+1}));navigate('draft');};
  useEffect(() => { const change = () => setPage(readPage()); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  useEffect(() => { if (state?.connections.obs.status !== 'connected') setStreamReady(false); }, [state?.connections.obs.status]);
  useEffect(() => {
    document.body.classList.toggle('overlay-body', output); document.documentElement.classList.toggle('overlay-document', output);
    return () => { document.body.classList.remove('overlay-body'); document.documentElement.classList.remove('overlay-document'); };
  }, [output]);
  // Warm the pending art in independent OBS browser sources before the director takes it.
  useEffect(() => { if (output) void loadStylePack(state?.overlay.stylePack).catch(() => {}); }, [output, state?.overlay.stylePack?.id, state?.overlay.stylePack?.revision]);
  useDirectorKeys({ ...broadcast, state: state ?? undefined }, page === 'studio', !output && !remote);
  // Before any snapshot exists, the browser source stays empty. Never expose
  // workstation branding, connection controls, or demo state to the audience.
  if (!state && output) return null;
  if (!state) return <div className="loading-screen"><Brand/><h2>{error ? '本地服务尚未连接' : '正在连接导播工作站'}</h2><p>{error || '载入赛事、素材与节目状态'}</p>{error && <button className="button primary" onClick={() => location.reload()}>重新连接</button>}</div>;
  const ctx = { state, champions, connected, send, notify, seat }, onAir = programState(state);
  if (output) {
    const preview = new URLSearchParams(location.search).get('preview') === '1';
    return <GameClockConnectionProvider value={connected}><BroadcastCanvas bus={preview ? 'preview' : 'program'} state={preview ? state : onAir} champions={champions} scene={preview ? state.previewScene : state.programScene} output/>{!connected && (preview ? state.previewScene : state.programScene) !== 'teamfight' && <div className="output-offline">导播服务中断 · 保留最后画面</div>}</GameClockConnectionProvider>;
  }
  const seatRecovery = { status: seatStatus, detail: seatError, recover: recoverSeat };
  if (remote) return <GameClockConnectionProvider value={connected}><Remote {...ctx} displaySeat={lastSeat} seatRecovery={seatRecovery} toast={toast} dismissNotice={dismissNotice}/></GameClockConnectionProvider>;
  return <GameClockConnectionProvider value={connected}>
    <div className={`app-shell control-room page-${page}`} data-layout={state.production?.layout ?? 'single'}>
      <aside className="control-rail">
        <a className="control-monogram" href="#studio" aria-label="RiftCast 导播台">R<span>c</span></a>
        <nav aria-label="主导航">{navigation.map(item => <button key={item.id} title={item.name} aria-label={item.name} aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={21}/><span>{item.label}</span></button>)}</nav>
        <button className="control-theme" title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>
        <span className="control-version" title={`RiftCast ${version}`}>{version}</span>
      </aside>
      <div className="control-body">
        <header className="control-header">
          <div className="control-title"><strong>RIFTCAST</strong><span>ARENA / {navigation.find(item => item.id === page)?.name}</span></div>
          <button className="control-match" title="正在节目中的比赛 · 打开赛事资料" onClick={() => navigate('manage')}><span>{onAir.match.title}</span><b>{getTeam(onAir, 'blue')?.tag} <em>{onAir.match.blueScore} : {onAir.match.redScore}</em> {getTeam(onAir, 'red')?.tag}</b><small>第 {onAir.match.game} 局</small></button>
          <span className="control-mode">{state.mode === 'demo' ? '演示数据' : '本地实况'}</span>
          <span className="control-seat" title={`当前节目控制者：${state.production?.control?.name ?? '等待席位'}`}>{seat?.name ?? (seatStatus === 'invalid' ? '席位失效' : '验证席位中')}</span>
          <span className={`control-sync ${connected && seat ? '' : 'disconnected'}`}><Wifi size={14}/>{connected ? seat ? '已同步' : '数据已同步 · 待验证席位' : '同步中断'}</span>
        </header>
        {!connected && <div className="control-disconnect" role="alert">{error || '同步中断，保留最后画面与本地草稿，正在重连。'}</div>}
        <SeatRecovery {...seatRecovery}/>
        <main className="control-main" inert={!seat}>
          <Suspense fallback={<div className="page-loading" role="status">正在载入页面…</div>}>
            {visited.has('studio') && <div className="control-page control-studio-page" hidden={page !== 'studio'}><Studio {...ctx} onSettings={() => navigate('settings')} onDraft={() => navigate('draft')} onRecords={records}/></div>}
            {visited.has('draft') && <div className="control-page" hidden={page !== 'draft'}><Draft {...ctx} focusTask={draftFocus}/></div>}
            {visited.has('data') && <div className="control-page" hidden={page !== 'data'}><LiveData {...ctx}/></div>}
            {visited.has('manage') && <div className="control-page" hidden={page !== 'manage'}><Management {...ctx} initialTab={managementTab} onOpenSettings={() => navigate('settings')}/></div>}
            {visited.has('settings') && <div className="control-page" hidden={page !== 'settings'}><Settings {...ctx} focusTask={settingsFocus} outputReady={streamReady} onOpenStudio={() => navigate('studio')} onOutputReady={setStreamReady}/></div>}
            {visited.has('help') && <div className="control-page" hidden={page !== 'help'}><Help state={state} onNavigate={guideNavigate}/></div>}
            {page === 'wrap' && <div className="control-page"><WrapUp {...ctx} streamReady={streamReady} onSettings={() => guideNavigate('settings','output')} onManage={() => navigate('manage')} onRecords={records} onNextGame={() => navigate('draft')} onNewSeries={newSeries} onReport={() => navigate('studio')}/></div>}
          </Suspense>
        </main>
        <div className="control-safety">
          <div className="control-notices"><Notification notice={toast} dismiss={dismissNotice}/></div>
          <ProductionBar {...ctx} showTake={page !== 'studio'}/>
        </div>
      </div>
    </div>
  </GameClockConnectionProvider>;
}
