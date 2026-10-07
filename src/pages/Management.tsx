import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Download, FileJson, Image, Plus, Save, Search, Shield, Trash2, Upload, Users, X } from 'lucide-react';
import type { Champion, Match, Recording, StateContext, Team } from '../../shared/types';
import { api } from '../lib';
import { frozenGameState, gameResultAwaitingTerminalSample } from '../../shared/game-results';
import { BroadcastCanvas } from '../components/BroadcastCanvas';
import '../components/match-lifecycle.css';
import './management.css';
import { HoldButton } from '../components/ProductionDesk';
import { csvRecording } from '../../shared/recording-export';

type ManagementTab = 'schedule' | 'teams' | 'assets' | 'recordings';
const roles = ['上单', '打野', '中单', '下路', '辅助'];
const statusLabels = { scheduled: '待开赛', live: '进行中', finished: '已结束' };
const getId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `local-${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
const newMatch = (teams: Team[]): Match => ({ id: getId(), title: '自定义赛事', blueTeamId: teams[0]?.id || '', redTeamId: teams[1]?.id || '', scheduledAt: new Date().toISOString(), format: 'BO3', status: 'scheduled', blueScore: 0, redScore: 0 });
const newTeam = (): Team => ({ id: getId(), name: '新建战队', tag: 'TEAM', color: '#cbf278', players: roles.map(role => ({ id:getId(), name: '', role })) });
const dateLabel = (value: string) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '时间待定';
const localDateInput = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请检查服务连接';

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportRecording(record: Recording, type: 'json' | 'csv') {
  const name = record.title.replace(/[<>:"/\\|?*]/g, '_');
  if (type === 'json') {
    download(`${name}.json`, JSON.stringify({ ...record, source: record.mode === 'demo' ? '本地演示记录' : '本地客户端采集记录' }, null, 2), 'application/json');
    return;
  }
  download(`${name}.csv`, csvRecording(record), 'text/csv;charset=utf-8');
}

export function Management({ state, send, champions, notify, initialTab='schedule', onOpenSettings }: StateContext & {initialTab?:ManagementTab;onOpenSettings?:()=>void}) {
  const [tab, setTab] = useState<ManagementTab>(initialTab);
  const [matchDraft, setMatchDraft] = useState<Match | null>(null);
  const [teamDraft, setTeamDraft] = useState<Team | null>(null);
  const editVersion=useRef(state.production?.configVersion);
  useEffect(()=>{if(teamDraft||matchDraft)editVersion.current=state.production?.configVersion;},[teamDraft?.id,matchDraft?.id]);
  const [uploading, setUploading] = useState(false);
  const [recordingTitle, setRecordingTitle] = useState('');
  const [search, setSearch] = useState('');
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedArchiveId,setSelectedArchiveId]=useState<string|null>(null);
  const [archiveScene,setArchiveScene]=useState<'ranking'|'postgame'>('postgame');
  const archivedResult=state.gameResults?.find(result=>result.id===selectedArchiveId);
  const archivedPreviewRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(archivedResult)archivedPreviewRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[selectedArchiveId]);
  const filteredChampions = useMemo(() => champions.filter(champion => `${champion.name} ${champion.id} ${champion.title} ${champion.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())), [champions, search]);
  const teamOf = (id: string) => state.teams.find(team => team.id === id);
  const tabs: { id: ManagementTab; label: string; icon: typeof CalendarDays; count: number }[] = [
    { id: 'schedule', label: '赛事赛程', icon: CalendarDays, count: state.schedule.length },
    { id: 'teams', label: '战队与选手', icon: Users, count: state.teams.length },
    { id: 'assets', label: '图片素材', icon: Image, count: state.assets.length },
    { id: 'recordings', label: '比赛记录', icon: FileJson, count: state.recordings.length },
  ];
  async function act(task: () => Promise<void>, success?: string) {
    setBusy(true);
    try { await task(); if (success) notify(success); } catch (error) { notify(messageOf(error)); } finally { setBusy(false); }
  }
  async function saveMatch() {
    if (!matchDraft) return;
    if (!matchDraft.title.trim() || !matchDraft.blueTeamId || !matchDraft.redTeamId) { notify('请填写赛事名称并选择两支战队'); return; }
    if (matchDraft.blueTeamId === matchDraft.redTeamId) { notify('请为比赛选择两支不同的战队'); return; }
    if (!Number.isFinite(Date.parse(matchDraft.scheduledAt))) { notify('请填写有效的开赛时间'); return; }
    await act(async () => {
      const match = { ...matchDraft, title: matchDraft.title.trim() };
      await send({ type: 'set-schedule', expectedConfigVersion:editVersion.current, schedule: state.schedule.some(item => item.id === match.id) ? state.schedule.map(item => item.id === match.id ? match : item) : [...state.schedule, match] });
      setMatchDraft(null);
    }, '赛程已保存');
  }
  async function saveTeam() {
    if (!teamDraft) return;
    if (!teamDraft.name.trim() || !teamDraft.tag.trim()) { notify('请填写战队名称和缩写'); return; }
    await act(async () => {
      const team = { ...teamDraft, name: teamDraft.name.trim(), tag: teamDraft.tag.trim().toUpperCase() };
      await send({ type: 'set-teams', expectedConfigVersion:editVersion.current, teams: state.teams.some(item => item.id === team.id) ? state.teams.map(item => item.id === team.id ? team : item) : [...state.teams, team] });
      setTeamDraft(null);
    }, '战队资料已保存');
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) { notify('支持 PNG、JPG、WebP 和 GIF 图片'); return; }
    if (file.size > 8 * 1024 * 1024) { notify('图片大小需在 8 MB 以内'); return; }
    setUploading(true);
    try {
      const body = new FormData(); body.append('file', file);
      await api('/api/assets', { method: 'POST', body });
      notify('图片已加入素材库，可用于战队标志与选手照片');
    } catch (error) { notify(messageOf(error)); } finally { setUploading(false); }
  }
  function updatePlayer(index: number, patch: Partial<Team['players'][number]>) {
    if (!teamDraft) return;
    setTeamDraft({ ...teamDraft, players: teamDraft.players.map((player, i) => i === index ? { ...player, ...patch } : player) });
  }
  return <div className="management-page">
    <div className="management-next-step"><span><strong>当前准备：{state.match.title}</strong><small>先维护战队与赛程，载入比赛后继续连接检查。</small></span>{onOpenSettings&&<button className="button primary small" onClick={onOpenSettings}>下一步：连接检查<ChevronRight size={14}/></button>}</div>
    <div className="management-tabs"  role="tablist" aria-label="赛事管理分类">{tabs.map(({ id, label, icon: Icon, count }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMatchDraft(null); setTeamDraft(null); }}><Icon size={17} /><span>{label}</span><small>{count}</small></button>)}</div>
    {tab === 'schedule' && <div className="management-content"><section className="panel"><div className="panel-head"><div><h2>比赛日程</h2><p className="muted">选择一场比赛，载入导播台的双方战队与比分。</p></div><button className="button primary small" onClick={() => setMatchDraft(newMatch(state.teams))}><Plus size={15} />新增比赛</button></div>
      <div className="schedule-table"><div className="schedule-table-heading"><span>比赛 / 时间</span><span>对阵</span><span>状态</span><span>操作</span></div>{state.schedule.length ? state.schedule.map(match => <div className="schedule-table-row" key={match.id}><div><strong>{match.title}</strong><small>{dateLabel(match.scheduledAt)} <span className="inline-separator">·</span> {match.format}</small></div><div className="match-teams"><span>{teamOf(match.blueTeamId)?.tag || '待定'}</span><b>{match.blueScore}<i>:</i>{match.redScore}</b><span>{teamOf(match.redTeamId)?.tag || '待定'}</span></div><span className={`match-status ${match.status}`}><span />{statusLabels[match.status]}</span><div className="row-actions"><button className="button small" onClick={() => setMatchDraft({ ...match })}>编辑</button><HoldButton disabled={busy} onExecute={() => void act(async () => { await send({ type: 'load-match', matchId: match.id }); onOpenSettings?.(); }, '比赛已载入，请核对连接与输出')}>按住载入</HoldButton></div></div>) : <div className="empty-state"><CalendarDays size={28} /><p>先添加一场比赛，开始准备赛程。</p></div>}</div>
    </section>{matchDraft && <section className="panel management-editor"><div className="panel-head"><h2>{state.schedule.some(match => match.id === matchDraft.id) ? '编辑比赛' : '新增比赛'}</h2><button className="button small" onClick={() => setMatchDraft(null)} aria-label="关闭比赛编辑"><X size={16} /></button></div><div className="form-grid">
      <label className="field">赛事 / 比赛名称<input maxLength={150} value={matchDraft.title} onChange={event => setMatchDraft({ ...matchDraft, title: event.target.value })} placeholder="例如：校园杯 · 决赛" /></label>
      <label className="field">开赛时间<input type="datetime-local" value={localDateInput(matchDraft.scheduledAt)} onChange={event => setMatchDraft({ ...matchDraft, scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : '' })} /></label>
      <label className="field">蓝色方<select value={matchDraft.blueTeamId} onChange={event => setMatchDraft({ ...matchDraft, blueTeamId: event.target.value })}><option value="">选择战队</option>{state.teams.map(team => <option key={team.id} value={team.id}>{team.name} · {team.tag}</option>)}</select></label>
      <label className="field">红色方<select value={matchDraft.redTeamId} onChange={event => setMatchDraft({ ...matchDraft, redTeamId: event.target.value })}><option value="">选择战队</option>{state.teams.map(team => <option key={team.id} value={team.id}>{team.name} · {team.tag}</option>)}</select></label>
      <label className="field">赛制<select value={matchDraft.format} onChange={event => setMatchDraft({ ...matchDraft, format: event.target.value })}>{['BO1', 'BO3', 'BO5', 'BO7'].map(format => <option key={format}>{format}</option>)}</select></label>
      <label className="field">比赛状态<select value={matchDraft.status} onChange={event => setMatchDraft({ ...matchDraft, status: event.target.value as Match['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">蓝色方比分<input type="number" min="0" max="99" value={matchDraft.blueScore} onChange={event => setMatchDraft({ ...matchDraft, blueScore: Math.max(0, Math.min(99, Number(event.target.value))) })} /></label>
      <label className="field">红色方比分<input type="number" min="0" max="99" value={matchDraft.redScore} onChange={event => setMatchDraft({ ...matchDraft, redScore: Math.max(0, Math.min(99, Number(event.target.value))) })} /></label>
    </div><div className="editor-footer">{state.schedule.some(match => match.id === matchDraft.id) && <button className="button small danger" disabled={busy} onClick={() => act(async () => { await send({ type: 'set-schedule', schedule: state.schedule.filter(match => match.id !== matchDraft.id) }); setMatchDraft(null); }, '比赛已从赛程移除')}><Trash2 size={14} />移除比赛</button>}<button className="button primary" disabled={busy} onClick={saveMatch}><Save size={15} />保存比赛</button></div></section>}</div>}
    {tab === 'teams' && <div className="management-content"><section className="panel"><div className="panel-head"><div><h2>参赛战队</h2><p className="muted">维护战队标志、首发名单与选手照片。</p></div><button className="button primary small" onClick={() => setTeamDraft(newTeam())}><Plus size={15} />新增战队</button></div><div className="team-card-grid">{state.teams.map(team => <button className={`team-directory-card ${teamDraft?.id === team.id ? 'selected' : ''}`} key={team.id} onClick={() => setTeamDraft({ ...team, players: roles.map((role, index) => ({ id:team.players[index]?.id??getId(), account:team.players[index]?.account??'', role: team.players[index]?.role || role, name: team.players[index]?.name || '', portrait: team.players[index]?.portrait })) })}><div className="team-directory-header"><div className="team-emblem" style={{ color: team.color }}>{team.logo ? <img src={team.logo} alt={`${team.name} 标志`} /> : <Shield size={28} />}</div><div><h3>{team.name}</h3><span>{team.tag}</span></div><ChevronRight size={16} /></div><div className="team-roster-mini">{team.players.map((player, index) => <div key={index}><small>{player.role}</small><span>{player.name || '待录入'}</span></div>)}</div></button>)}</div>{!state.teams.length && <div className="empty-state"><Users size={28} /><p>添加战队，录入五名首发选手。</p></div>}</section>
      {teamDraft && <section className="panel management-editor"><div className="panel-head"><h2>战队资料</h2><button className="button small" onClick={() => setTeamDraft(null)} aria-label="关闭战队编辑"><X size={16} /></button></div><div className="form-grid"><label className="field">战队名称<input maxLength={80} value={teamDraft.name} onChange={event => setTeamDraft({ ...teamDraft, name: event.target.value })} /></label><label className="field">战队缩写<input maxLength={12} value={teamDraft.tag} onChange={event => setTeamDraft({ ...teamDraft, tag: event.target.value })} /></label><label className="field">战队标志<select value={teamDraft.logo || ''} onChange={event => setTeamDraft({ ...teamDraft, logo: event.target.value || undefined })}><option value="">默认标志</option>{state.assets.map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}</select></label><label className="field">战队颜色<div className="color-field"><input type="color" value={teamDraft.color} onChange={event => setTeamDraft({ ...teamDraft, color: event.target.value })} /><span>{teamDraft.color.toUpperCase()}</span></div></label></div><div className="roster-editor"><div className="roster-editor-head"><span>位置</span><span>播出名称</span><span>游戏账号 / ID</span><span>选手照片</span></div>{teamDraft.players.map((player, index) => <div className="roster-editor-row" key={index}><select aria-label={`选手 ${index + 1} 位置`} value={player.role} onChange={event => updatePlayer(index, { role: event.target.value })}>{roles.map(role => <option key={role}>{role}</option>)}</select><input aria-label={`选手 ${index + 1} 名称`} maxLength={80} value={player.name} onChange={event => updatePlayer(index, { name: event.target.value })} placeholder="输入播出名称" /><input aria-label={`选手 ${index + 1} 游戏账号`} maxLength={150} value={player.account??''} onChange={event=>updatePlayer(index,{account:event.target.value})} placeholder="对应 API 名称或唯一游戏 ID" /><select aria-label={`选手 ${index + 1} 照片`} value={player.portrait || ''} onChange={event => updatePlayer(index, { portrait: event.target.value || undefined })}><option value="">默认头像</option>{state.assets.map(asset => <option key={asset.id} value={asset.url}>{asset.name}</option>)}</select></div>)}</div><p className="muted management-note">在「图片素材」上传战队标志与选手照片，即可在这里选择。</p><div className="editor-footer">{state.teams.some(team => team.id === teamDraft.id) && <button className="button small danger" disabled={busy} onClick={() => { if (state.teams.length <= 2) { notify('资料库需保留至少两支战队'); return; } if (state.schedule.some(match => match.blueTeamId === teamDraft.id || match.redTeamId === teamDraft.id) || state.match.blueTeamId === teamDraft.id || state.match.redTeamId === teamDraft.id) { notify('该战队正在用于赛程或当前比赛，请先修改相关对阵'); return; } void act(async () => { await send({ type: 'set-teams', teams: state.teams.filter(team => team.id !== teamDraft.id) }); setTeamDraft(null); }, '战队已移除'); }}><Trash2 size={14} />移除战队</button>}<button className="button primary" disabled={busy} onClick={saveTeam}><Save size={15} />保存战队</button></div></section>}
    </div>}
    {tab === 'assets' && <div className="management-content"><section className="panel"><div className="panel-head"><div><h2>本地图片素材</h2><p className="muted">战队标志、选手照片、赛事与赞助商图片。</p></div><label className={`button primary small upload-button ${uploading ? 'disabled' : ''}`}><Upload size={15} />{uploading ? '正在上传…' : '上传图片'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label></div>{state.assets.length ? <div className="asset-grid">{state.assets.map(asset => <div className="asset-card" key={asset.id}><div className="asset-preview"><img src={asset.url} alt={asset.name} loading="lazy" /></div><strong title={asset.name}>{asset.name}</strong><a href={asset.url} target="_blank" rel="noreferrer">打开图片<ChevronRight size={12} /></a></div>)}</div> : <div className="asset-upload-empty"><Image size={30} /><strong>为你的赛事添加视觉素材</strong><p className="muted">支持 PNG / JPG / WebP / GIF，单张最大 8 MB。</p><p className="muted">上传的图片保存在本机，可在战队资料中使用。</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h2>英雄图库</h2><p className="muted">Data Dragon 英雄头像与原画，供选人画面和导播参考。</p></div><div className="search-field"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索英雄 / 英文名" aria-label="搜索英雄" /><span>{filteredChampions.length}</span></div></div><div className="champion-browser"><div className="champion-grid">{filteredChampions.map(champion => <button className={`champion-image-card ${selectedChampion?.id === champion.id ? 'selected' : ''}`} key={champion.id} onClick={() => setSelectedChampion(champion)}><img src={champion.image} alt={champion.name} loading="lazy" /><span>{champion.name}</span></button>)}{!filteredChampions.length && <div className="empty-state"><Search size={24} /><p>{champions.length ? '未找到匹配的英雄' : '英雄资源加载中，请检查网络连接'}</p></div>}</div>{selectedChampion && <div className="champion-inspector"><img src={selectedChampion.splash} alt={`${selectedChampion.name} 原画`} /><div><small>{selectedChampion.title}</small><h3>{selectedChampion.name}</h3><span className="muted">{selectedChampion.id} · ID {selectedChampion.key}</span><div className="champion-tags">{selectedChampion.tags.map(tag => <span className="badge" key={tag}>{tag}</span>)}</div><a className="button small" href={selectedChampion.splash} target="_blank" rel="noreferrer">打开原画<ChevronRight size={13} /></a></div></div>}</div></section>
    </div>}
    {tab === 'recordings' && <div className="management-content"><section className="panel">
      <div className="panel-head"><div><h2>比赛记录</h2><p className="muted">对局结束后自动归档最终数据；每局保留独立报告，也可另存比赛中途快照。</p></div><span className="badge">本地比赛数据</span></div>
      <div className="save-recording-bar"><div><Check size={18} /><span>当前比赛 <strong>{state.match.title}</strong><small>第 {state.match.game} 局 · {durationLabel(state.gameTime)} · {state.mode === 'demo' ? '演示数据' : '客户端采集数据'}</small></span></div><input aria-label="记录标题" placeholder="记录名称（可选）" maxLength={150} value={recordingTitle} onChange={event => setRecordingTitle(event.target.value)} /><button className="button primary small" disabled={busy} onClick={() => act(async () => { await send({ type: 'save-recording', title: recordingTitle.trim() || undefined }); setRecordingTitle(''); }, '当前比赛快照已保存')}><Save size={15} />保存记录</button></div>
      {archivedResult&&<div className="archived-game-preview" ref={archivedPreviewRef} aria-label={`第 ${archivedResult.game} 局归档报告`}><div className="archived-game-preview-head"><span><strong>{archivedResult.match.title} · 第 {archivedResult.game} 局{gameResultAwaitingTerminalSample(archivedResult)?'已保存观测数据':'最终数据'}</strong><small>{dateLabel(archivedResult.endedAt)} · {archivedResult.match.format} · 系列赛 {archivedResult.match.blueScore}:{archivedResult.match.redScore} · {gameResultAwaitingTerminalSample(archivedResult)?'等待终局样本':'已冻结'}</small></span><div className="inline-buttons"><button className={'button small '+(archiveScene==='postgame'?'primary':'')} onClick={()=>setArchiveScene('postgame')}>赛后报告</button><button className={'button small '+(archiveScene==='ranking'?'primary':'')} onClick={()=>setArchiveScene('ranking')}>选手数据</button><button className="button small" onClick={()=>setSelectedArchiveId(null)}><X size={13}/>关闭</button></div></div><BroadcastCanvas state={{...frozenGameState(state,archivedResult),selectedPlayerId:null}} champions={champions} scene={archiveScene}/></div>}
      <div className="recording-list">{state.recordings.length ? state.recordings.map(record=>{
        const result=state.gameResults?.find(game=>game.snapshot.id===record.id);
        return <div className="recording-row" key={record.id}><div className="recording-icon"><FileJson size={22}/></div><div className="recording-description"><strong>{record.title}</strong><small>{dateLabel(record.createdAt)} · {durationLabel(record.duration)} · {record.players.length} 位选手 / {record.events.length} 条事件{result?` · GAME ${result.game} ${gameResultAwaitingTerminalSample(result)?'已保存观测数据':'最终数据'}`:''}</small></div><span className={`badge ${record.mode==='demo'?'demo-label':''}`}>{result?(gameResultAwaitingTerminalSample(result)?'本局观测归档':'已结算并归档'):record.mode==='demo'?'本地演示记录':'本地客户端快照'}</span><div className="row-actions">{result&&<button className="button small" onClick={()=>{setSelectedArchiveId(result.id);setArchiveScene('postgame');}}>查看赛后报告</button>}<button className="button small" onClick={()=>exportRecording(record,'json')}><Download size={14}/>JSON</button><button className="button small" onClick={()=>exportRecording(record,'csv')}><Download size={14}/>CSV</button></div></div>;
      }) : <div className="empty-state"><FileJson size={28}/><p>比赛记录将保存在这里。</p></div>}</div>
      <p className="muted management-note">最终报告保留该局战队、系列赛比分、选手、事件、经济曲线与双方统计；进入下一局后仍可查看和导出。记录保存在本机，未提供的字段保留为空。</p>
    </section></div>}
  </div>;
}
