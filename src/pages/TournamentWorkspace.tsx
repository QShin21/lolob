import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Download, Plus, Trophy, ArrowUp, ArrowDown } from 'lucide-react';
import type { BroadcastAction, Match, StateContext } from '../../shared/types';
import type { BestOf, Standing, TournamentConfig, TournamentFormat } from '../../shared/tournament-types';
import { buildTournament, entryLabel, tournamentFormats, tournamentStates, winTarget } from '../../shared/tournaments';
import { tournamentReport } from '../../shared/tournament-report';
import { TaskTabs } from '../components/ConsoleUI';
import { HoldButton } from '../components/ProductionDesk';
import './tournament-workspace.css';

const localDate = (value: string) => { const d = new Date(value); return Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''; };
const dateText = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const formats: BestOf[] = ['BO1', 'BO3', 'BO5', 'BO7'];
const sourceNames = { live: '终局原始数据', eog: '客户端结算', details: '比赛详情', timeline: '比赛时间线' } as const;
type View = 'schedule' | 'standings' | 'players' | 'archive' | 'assets';

export function TournamentWorkspace(ctx: StateContext) {
  const { state, seat, connected, send, notify } = ctx;
  const [selected, setSelected] = useState(''), [creating, setCreating] = useState(false), [view, setView] = useState<View>('schedule');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [page, setPage] = useState(0), [editId, setEditId] = useState('');
  const active = useRef(false);
  const canEdit = !!seat && !!connected && ['director', 'data'].includes(seat.role);
  const canDirect = canEdit && seat?.role === 'director' && state.production?.control?.owner === seat.id;
  const events = state.tournaments ?? [], event = events.find(t => t.id === selected) ?? events.at(-1);
  const data = useMemo(() => event ? tournamentReport(state, event) : undefined, [state, event]);
  const teamName = (id?: string) => state.teams.find(t => t.id === id)?.name ?? event?.teams.find(t => t.id === id)?.name ?? '待定';
  const [config, setConfig] = useState<TournamentConfig>(() => ({ name: '', format: 'single-elimination', teamIds: state.teams.map(t => t.id), bestOf: 'BO3', finalBestOf: 'BO5', startAt: new Date().toISOString(), intervalMinutes: 90, legs: 1, groupCount: 2, advancePerGroup: 2, swissRounds: 3, grandFinalReset: true }));
  const [names, setNames] = useState('');
  const newNames = names.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  const preview = useMemo(() => {
    try {
      const entries = names.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
      if (new Set(entries).size !== entries.length) throw new Error('批量战队名称重复');
      const added = entries.map((name, i) => ({ id: `preview-team-${i}`, name, tag: name.slice(0, 12), color: '#70d7c2', players: [] }));
      return { value: buildTournament('preview', { ...config, teamIds: [...config.teamIds, ...added.map(t => t.id)] }, [...state.teams, ...added]), error: '' };
    } catch (e) { return { value: undefined, error: e instanceof Error ? e.message : '请补充赛事设置' }; }
  }, [config, names, state.teams]);
  async function run(action: BroadcastAction, message: string, after?: () => void) {
    if (active.current) return;
    active.current = true; setBusy(true); setError('');
    try { await send(action); notify(message, 'success'); after?.(); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败，输入已保留'); }
    finally { active.current = false; setBusy(false); }
  }
  const change = <K extends keyof TournamentConfig>(key: K, value: TournamentConfig[K]) => setConfig(c => ({ ...c, [key]: value }));
  const rows = data?.matches.filter(m => (!query || `${m.title} ${teamName(m.blueTeamId)} ${teamName(m.redTeamId)}`.toLowerCase().includes(query.toLowerCase())) && (filter === 'all' || m.tournament!.state === filter)) ?? [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 30) - 1));
  const openEvent = (id: string) => { setSelected(id); setCreating(false); setPage(0); setEditId(''); setError(''); };

  return <div className="tournament-workspace">
    <aside className="tournament-directory">
      <button className="button primary" disabled={!canEdit || busy} onClick={() => { setCreating(true); setError(''); }}><Plus size={16} />建立整届赛事</button>
      <div className="domain-scroll tournament-event-list">{events.map(t => <button key={t.id} className="manage-object" aria-pressed={!creating && t.id === event?.id} onClick={() => openEvent(t.id)}><Trophy size={18} /><span><strong>{t.config.name}</strong><small>{tournamentFormats[t.config.format]} · {t.config.teamIds.length} 队</small><small>{t.status === 'finished' ? '已完赛' : t.status === 'live' ? '进行中' : '待开赛'}</small></span></button>)}</div>
      <p className="tournament-muted">一次选择参赛队伍与赛制，自动生成各轮对阵。单局归档后同步大场比分和晋级。</p>
    </aside>
    <div className="tournament-content domain-scroll">
      {error && <div role="alert" className="domain-note error">{error}</div>}
      {creating ? <form className="tournament-create" onSubmit={e => { e.preventDefault(); if (preview.value) void run({ type: 'create-tournament', config, newTeamNames: newNames }, '整届赛事已建立，赛程与晋级规则已保存', () => { setCreating(false); setSelected(''); setNames(''); setView('schedule'); }); }}>
        <header><h2>建立整届赛事</h2><p>队伍顺序即种子顺序；资料库中已保存的队标、选手与照片会随对阵载入。</p></header>
        <fieldset disabled={busy || !canEdit}>
          <div className="tournament-form-grid">
            <label>赛事名称<input required maxLength={100} value={config.name} onChange={e => change('name', e.target.value)} placeholder="例如：2026 秋季邀请赛" /></label>
            <label>赛事形式<select aria-label="赛事形式" value={config.format} onChange={e => change('format', e.target.value as TournamentFormat)}>{Object.entries(tournamentFormats).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label>常规对阵局数<select aria-label="常规对阵局数" value={config.bestOf} onChange={e => change('bestOf', e.target.value as BestOf)}>{formats.map(f => <option key={f}>{f}</option>)}</select></label>
            <label>淘汰赛 / 总决赛局数<select aria-label="淘汰赛 / 总决赛局数" value={config.finalBestOf} onChange={e => change('finalBestOf', e.target.value as BestOf)}>{formats.map(f => <option key={f}>{f}</option>)}</select></label>
            <label>首场开始时间<input type="datetime-local" required value={localDate(config.startAt)} onChange={e => change('startAt', e.target.value ? new Date(e.target.value).toISOString() : '')} /></label>
            <label>每场预留时间（分钟）<input type="number" min={1} max={10080} value={config.intervalMinutes} onChange={e => change('intervalMinutes', Number(e.target.value))} /></label>
            {['round-robin', 'groups-knockout'].includes(config.format) && <label>循环次数<select value={config.legs} onChange={e => change('legs', Number(e.target.value) as 1 | 2)}><option value={1}>单循环</option><option value={2}>双循环（交换蓝红方）</option></select></label>}
            {config.format === 'groups-knockout' && <><label>小组数量<input type="number" min={2} max={16} value={config.groupCount} onChange={e => change('groupCount', Number(e.target.value))} /></label><label>每组晋级队数<input type="number" min={1} max={32} value={config.advancePerGroup} onChange={e => change('advancePerGroup', Number(e.target.value))} /></label></>}
            {config.format === 'swiss' && <label>瑞士轮轮数<input type="number" min={1} max={63} value={config.swissRounds} onChange={e => change('swissRounds', Number(e.target.value))} /></label>}
          </div>
          {config.format === 'double-elimination' && <label className="tournament-check"><input type="checkbox" checked={config.grandFinalReset} onChange={e => change('grandFinalReset', e.target.checked)} />败者组冠军赢下总决赛时，自动启用重置场</label>}
          <div className="tournament-roster-grid"><section><div className="tournament-section-title"><h3>选择已有战队 · {config.teamIds.length}</h3><button type="button" className="button small" onClick={() => change('teamIds', [])}>清空选择</button></div>
            <div className="tournament-team-picker">{state.teams.map(t => <label className="tournament-check" key={t.id}><input type="checkbox" checked={config.teamIds.includes(t.id)} onChange={e => change('teamIds', e.target.checked ? [...config.teamIds, t.id] : config.teamIds.filter(id => id !== t.id))} />{t.name}</label>)}</div>
            <label>批量新建战队（每行一队）<textarea rows={5} value={names} onChange={e => setNames(e.target.value)} placeholder={'战队 A\n战队 B\n战队 C'} /></label>
          </section><section><h3>种子顺序</h3><ol className="tournament-seeds">{config.teamIds.map((id, i) => <li key={id}><span>{teamName(id)}</span><button type="button" className="button small" aria-label={`上移 ${teamName(id)}`} disabled={i === 0} onClick={() => { const ids = [...config.teamIds]; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; change('teamIds', ids); }}><ArrowUp size={12} /></button><button type="button" className="button small" aria-label={`下移 ${teamName(id)}`} disabled={i === config.teamIds.length - 1} onClick={() => { const ids = [...config.teamIds]; [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; change('teamIds', ids); }}><ArrowDown size={12} /></button></li>)}{newNames.map((name, i) => <li key={`new-${i}`}><span>{name}</span><small>新建</small></li>)}</ol></section></div>
          <div className="tournament-preview" aria-live="polite">{preview.value ? <><strong>{config.teamIds.length + newNames.length} 支队伍 · {preview.value.matches.length} 场赛程席位 · {preview.value.matches.filter(m => m.tournament!.state === 'bye').length} 场首轮轮空</strong><p>从 {dateText(config.startAt)} 起按单比赛台顺序安排，每场预留 {config.intervalMinutes} 分钟。建立后可逐场调整时间和局数。</p>{config.format === 'swiss' && <p>每轮结束后按积分配对，优先避免重赛；轮空优先安排给尚未轮空的低分队。</p>}{preview.value.tournament.groups.length > 0 && <p>{preview.value.tournament.groups.map(g => `${g.id} 组：${g.teamIds.map(id => preview.value!.tournament.teams.find(t => t.id === id)?.name).join('、')}`).join('；')}</p>}</> : <p>{preview.error}</p>}</div>
          <footer className="domain-actions"><button type="button" className="button" onClick={() => setCreating(false)}>返回赛事</button><button type="submit" className="button primary" disabled={!preview.value || busy}>生成整届赛事</button></footer>
        </fieldset>
      </form> : event && data ? <>
        <header className="tournament-header"><div><small>{tournamentFormats[event.config.format]} · {event.config.teamIds.length} 支队伍</small><h2>{event.config.name}</h2><p>已完成 {data.completed} / {data.actual} 场 · 已归档 {data.results.length} 局{event.championTeamId ? ` · 冠军：${teamName(event.championTeamId)}` : ''}</p></div><div className="domain-actions"><a className="button" href={`/api/tournaments/${event.id}/export?format=zip`}><Download size={15} />整届打包</a><a className="button" href={`/api/tournaments/${event.id}/export?format=csv`}>统计 CSV</a></div></header>
        {event.blockedReason && <div role="alert" className="domain-note error">{event.blockedReason}</div>}
        <TaskTabs items={[{ id: 'schedule', label: '对阵与晋级' }, { id: 'standings', label: '积分排名' }, { id: 'players', label: '选手统计' }, { id: 'archive', label: `逐局档案 · ${data.results.length}` }, { id: 'assets', label: `赛事素材 · ${data.assets.length}` }]} value={view} onChange={setView} label="赛事内容" />
        {view === 'schedule' && <>
          <div className="tournament-toolbar"><input aria-label="搜索本届对阵" placeholder="搜索阶段或队伍" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /><select aria-label="筛选对阵状态" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}>{Object.entries({ all: '全部对阵', ...tournamentStates }).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
          <div className="tournament-match-list">{rows.slice(currentPage * 30, (currentPage + 1) * 30).map(m => <article key={m.id} className="tournament-match" data-match-id={m.id}>
            <div className="tournament-match-info"><small>第 {m.tournament!.order + 1} 场 · {m.title.slice(event.config.name.length + 3)}</small><div className="tournament-versus"><strong>{m.blueTeamId ? teamName(m.blueTeamId) : entryLabel(m.tournament!.blue, state)}</strong><b>{m.blueScore} : {m.redScore}</b><strong>{m.redTeamId ? teamName(m.redTeamId) : entryLabel(m.tournament!.red, state)}</strong></div><small>{dateText(m.scheduledAt)} · {m.format} · {tournamentStates[m.tournament!.state]}{m.status === 'live' ? ' · 对局进行中' : ''}</small>{m.tournament!.pairingWarning && <p role="status">{m.tournament!.pairingWarning}</p>}</div>
            <div className="domain-actions"><button className="button small" disabled={!canEdit || busy} onClick={() => setEditId(editId === m.id ? '' : m.id)}>调整 / 赛果</button><HoldButton disabled={!canDirect || busy || !!m.tournament!.manualResult || !['ready', 'complete'].includes(m.tournament!.state)} onExecute={() => void run({ type: 'load-match', matchId: m.id }, '对阵已载入准备区')}>按住载入</HoldButton></div>
            {editId === m.id && <MatchEditor key={`${m.id}:${m.scheduledAt}:${m.blueScore}:${m.redScore}`} match={m} hasGames={data.results.some(r => r.matchId === m.id)} disabled={busy || !canEdit} canDirect={canDirect} onAction={run} />}
          </article>)}</div>
          {!rows.length && <div className="domain-empty">当前筛选下没有对阵。</div>}
          {rows.length > 30 && <div className="domain-actions"><button className="button small" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {Math.ceil(rows.length / 30)}</span><button className="button small" disabled={(currentPage + 1) * 30 >= rows.length} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
        </>}
        {view === 'standings' && <><p className="tournament-muted">胜 3 分，负 0 分。按积分{event.config.format === 'swiss' ? '、对手积分和' : ''}、净胜局、胜局排序；两队同分比较相互战绩，再按种子顺序。瑞士轮轮空计 3 分。淘汰赛名次以晋级和冠军为准。</p>{data.groups.length ? data.groups.map(g => <section key={g.id}><h3>{g.id} 组 · 前 {event.config.advancePerGroup} 名晋级</h3><Standings rows={g.standings} teamName={teamName} /></section>) : <Standings rows={data.standings} teamName={teamName} />}</>}
        {view === 'players' && <><p className="tournament-muted">根据有效单局归档累计。括号内为该指标已有数据的局数；缺失数据保留为空。</p><div className="tournament-table-scroll"><table><thead><tr>{['选手 / 战队', '局数', '胜局', '击杀 / 死亡 / 助攻', '场均补刀', '场均金币', '场均英雄伤害', '场均视野'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{data.players.map(p => <tr key={p.id}><td>{p.name}<small>{teamName(p.teamId)}</small></td><td>{p.games}</td><td>{p.wins}</td><td>{p.scoreGames ? `${p.kills} / ${p.deaths} / ${p.assists} (${p.scoreGames})` : '—'}</td>{([[p.cs, p.scoreGames], [p.gold, p.goldGames], [p.damage, p.damageGames], [p.vision, p.visionGames]] as const).map(([total, count], i) => <td key={i}>{count ? `${Math.round(total / count)} (${count})` : '—'}</td>)}</tr>)}</tbody></table></div>{!data.players.length && <div className="domain-empty">完成第一局归档后，这里会汇总选手表现。</div>}</>}
        {view === 'archive' && <><p className="tournament-muted">结束信号触发逐局归档，并在后台补拉客户端数据。可在客户端保持连接时重试未取得的项目。</p>{data.results.map(r => <details key={r.id} className="tournament-archive"><summary><strong>{r.match.title} · 第 {r.game} 局</strong><span>{r.winnerTeamId ? `${teamName(r.winnerTeamId)} 获胜` : '胜方待确认'} · {r.terminalSampleComplete ? '核心终局统计齐全' : '终局统计含缺失'}</span></summary><p>对局 ID：{r.sourceGameId ?? '尚未取得'} · {r.snapshot.players.length} 名选手 · {r.snapshot.events.length} 个事件 · {r.snapshot.economy.length} 个经济采样点</p><div className="tournament-source-grid">{Object.entries(sourceNames).map(([key, label]) => { const source = r.archive?.sources[key as keyof typeof sourceNames]; return <div key={key}><strong>{label}</strong><span>{source?.status === 'saved' ? '已保存' : source?.status === 'unavailable' ? '未取得 · 可重试' : key === 'live' ? '原始响应未取得 · 快照已保留' : !r.sourceGameId ? '等待对局 ID' : '等待采集'}</span>{source?.detail && <small>{source.detail}</small>}</div>; })}</div><div className="domain-actions"><a className="button small" href={`/api/game-archives/${r.id}`}>下载此局完整数据</a><button className="button small" disabled={!canEdit || busy || !r.sourceGameId} onClick={() => void run({ type: 'retry-game-archive', resultId: r.id }, '已加入后台补采队列')}>重试缺失数据</button></div><details><summary>查看十人快照、BP 与事件</summary><pre>{JSON.stringify({ players: r.snapshot.players, draft: r.draft, stats: r.snapshot.stats, events: r.snapshot.events }, null, 2)}</pre></details></details>)}{!data.results.length && <div className="domain-empty">载入对阵并完成比赛后，单局数据会自动归入本届赛事。人工补录大场比分会保留补录原因。</div>}{data.invalidAttempts.length > 0 && <details className="tournament-archive"><summary>作废与重赛记录 · {data.invalidAttempts.length}</summary>{data.invalidAttempts.map((a,i)=><p key={i}>{a.result?.match.title} · 第 {a.result?.game} 局 · {a.reason} {a.result&&<a className="button small" href={`/api/game-archives/${a.result.id}`}>下载作废局数据</a>}</p>)}</details>}{event.history.length > 0 && <details className="tournament-archive"><summary>大场赛果补录 / 修订记录 · {event.history.length}</summary>{event.history.map((h, i) => <p key={i}>{dateText(h.at)} · {data.matches.find(m => m.id === h.matchId)?.title} · {h.before?.join(':')} → {h.after.join(':')} · {h.reason}</p>)}</details>}</>}
        {view === 'assets' && <><p className="tournament-muted">参赛战队的队标与选手照片自动归集。勾选其他赛事图片后，整届打包会带上这些素材。</p><div className="tournament-assets">{state.assets.map(a => <label key={a.id} className="tournament-asset"><img src={a.url} alt={a.name} /><span><input type="checkbox" checked={data.assets.some(asset => asset.id === a.id)} disabled={!canEdit || busy || data.assets.some(asset => asset.id === a.id) && !event.assetIds.includes(a.id)} onChange={e => void run({ type: 'update-tournament', tournamentId: event.id, assetIds: e.target.checked ? [...event.assetIds, a.id] : event.assetIds.filter(id => id !== a.id) }, '赛事素材已更新')} />{a.name}</span><small>{event.assetIds.includes(a.id) ? '赛事关联素材' : data.assets.some(asset => asset.id === a.id) ? '战队 / 选手资料' : '可关联'}</small></label>)}</div>{!state.assets.length && <div className="domain-empty">在“图片素材”上传队标、选手照片或赛事图片后，即可在此关联。</div>}</>}
      </> : <div className="domain-empty tournament-empty"><CalendarDays size={42} /><h2>从整届赛事开始准备</h2><p>支持单败、双败、循环赛、小组赛接淘汰赛和瑞士轮。输入参赛队伍，一次生成赛程并持续归档。</p><button className="button primary" disabled={!canEdit} onClick={() => setCreating(true)}>建立整届赛事</button></div>}
    </div>
  </div>;
}

function Standings({ rows, teamName }: { rows: Standing[]; teamName: (id: string) => string }) {
  return <div className="tournament-table-scroll"><table><thead><tr>{['排名', '战队', '场次', '胜 / 负', '局分', '积分', '对手积分和', '轮空'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.teamId}><td>{r.rank}</td><td>{teamName(r.teamId)}</td><td>{r.played}</td><td>{r.wins} / {r.losses}</td><td>{r.gameWins} : {r.gameLosses}</td><td><strong>{r.points}</strong></td><td>{r.buchholz}</td><td>{r.byes}</td></tr>)}</tbody></table></div>;
}
function MatchEditor({ match, hasGames, disabled, canDirect, onAction }: { match: Match; hasGames: boolean; disabled: boolean; canDirect: boolean; onAction: (action: BroadcastAction, message: string) => Promise<void> }) {
  const [date, setDate] = useState(localDate(match.scheduledAt)), [format, setFormat] = useState(match.format), [blue, setBlue] = useState(match.blueScore || winTarget(match.format)), [red, setRed] = useState(match.redScore), [reason, setReason] = useState('');
  return <div className="tournament-match-editor"><fieldset disabled={disabled}><div className="tournament-form-grid"><label>调整开赛时间<input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} /></label><label>此场局数<select value={format} onChange={e => setFormat(e.target.value)}>{formats.map(f => <option key={f}>{f}</option>)}</select></label></div><button className="button small" disabled={!date} onClick={() => void onAction({ type: 'reschedule-tournament-match', matchId: match.id, scheduledAt: new Date(date).toISOString(), format }, '此场安排已保存')}>保存安排</button></fieldset>
    {!hasGames && ['ready', 'complete'].includes(match.tournament!.state) ? <fieldset disabled={disabled || !canDirect}><p>补录已结束的大场比分，系统会推进晋级。单局数据通过对局采集归档。</p><div className="tournament-form-grid"><label>蓝方胜局<input type="number" min={0} max={winTarget(match.format)} value={blue} onChange={e => setBlue(Number(e.target.value))} /></label><label>红方胜局<input type="number" min={0} max={winTarget(match.format)} value={red} onChange={e => setRed(Number(e.target.value))} /></label><label>补录 / 修订原因<input maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：副台比赛已结束，核对裁判记录" /></label></div><button className="button small" disabled={!reason.trim()} onClick={() => void onAction({ type: 'set-tournament-result', matchId: match.id, blueScore: blue, redScore: red, reason }, '大场赛果已保存，后续对阵已更新')}>保存赛果并推进</button></fieldset> : hasGames ? <p>此场已保存单局数据，胜方修订请载入此场后在“赛后收尾”操作。</p> : null}
  </div>;
}
