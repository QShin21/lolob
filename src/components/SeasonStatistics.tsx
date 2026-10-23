import { useMemo, useState } from 'react';
import type { BroadcastState } from '../../shared/types';
import { seasonLeaderboard, seasonMetricLabels, seasonMetricValue, seasonStatistics, type SeasonMetric, type SeasonPlayer } from '../../shared/season-statistics';
import './season-statistics.css';

const percentMetrics = new Set<SeasonMetric>(['winRate', 'killParticipation', 'damageShare']);
const valueText = (value: number | null, metric: SeasonMetric) => value === null ? '—' : percentMetrics.has(metric) ? `${(value * 100).toFixed(1)}%` : value.toLocaleString('zh-CN', { maximumFractionDigits: ['games', 'damage', 'gold', 'cs'].includes(metric) ? 0 : 2 });
const rate = (v: number | null) => valueText(v, 'winRate');
export function seasonOverlayUrl(tournamentId: string, metric: SeasonMetric, playerId = '', minimumGames = 1) {
  const params = new URLSearchParams({ metric });
  if (tournamentId) params.set('tournament', tournamentId);
  if (playerId) params.set('player', playerId);
  if (minimumGames > 1) params.set('minimum', String(minimumGames));
  return `/overlay/season?${params}`;
}

export function SeasonStatistics({ state, tournamentId }: { state: BroadcastState; tournamentId?: string }) {
  const [scope, setScope] = useState(tournamentId ?? ''), [metric, setMetric] = useState<SeasonMetric>('kda');
  const [view, setView] = useState<'players' | 'champions' | 'head-to-head'>('players');
  const [spotlight, setSpotlight] = useState(''), [minimumGames, setMinimumGames] = useState(1), [copied, setCopied] = useState('');
  const selectedScope = tournamentId ?? scope;
  const data = useMemo(() => seasonStatistics(state, selectedScope || undefined), [state, selectedScope]);
  const rows = seasonLeaderboard(data, metric, minimumGames);
  const selectedPlayer = data.players.find(p => p.id === spotlight);
  const url = seasonOverlayUrl(selectedScope, metric, selectedPlayer?.id, minimumGames);
  async function copyUrl() {
    try { await navigator.clipboard.writeText(new URL(url, window.location.origin).href); setCopied('浏览器源地址已复制'); }
    catch { setCopied('复制未完成，可打开右侧浏览器源链接后复制地址'); }
  }
  return <section className="season-statistics" aria-label="赛季统计">
    <header className="season-statistics-header"><div><h2>赛季统计与交手记录</h2><p>{data.title} · {data.games} 局归档 · {data.resolvedGames} 局胜方已确认</p></div><div className="season-statistics-actions"><button className="button" onClick={() => void copyUrl()}>复制图形地址</button><a className="button" href={url} target="_blank" rel="noreferrer">打开浏览器源</a></div></header>
    {copied && <p role="status">{copied}</p>}
    <div className="season-statistics-controls">
      {tournamentId === undefined && <label>统计范围<select value={scope} onChange={e => { setScope(e.target.value); setSpotlight(''); }}><option value="">全部已归档比赛</option>{state.tournaments?.map(t => <option key={t.id} value={t.id}>{t.config.name}</option>)}</select></label>}
      <label>排行榜指标<select aria-label="排行榜指标" value={metric} onChange={e => setMetric(e.target.value as SeasonMetric)}>{Object.entries(seasonMetricLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>最少出场局数<input aria-label="最少出场局数" type="number" min="1" max="10000" value={minimumGames} onChange={e => setMinimumGames(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))} /></label>
      <label>观众图形<select value={selectedPlayer?.id ?? ''} onChange={e => setSpotlight(e.target.value)}><option value="">指标排行榜 · 前五名</option>{data.players.map(p => <option key={p.id} value={p.id}>{p.teamName} · {p.name} · 选手聚焦</option>)}</select></label>
    </div>
    <nav className="season-statistics-tabs" aria-label="赛季统计内容">{([['players', '选手排行'], ['champions', '英雄选禁'], ['head-to-head', '历史交手']] as const).map(([id, label]) => <button key={id} className="button" aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</nav>
    {view === 'champions' && <p className="season-statistics-note">选用率样本 {data.draftCoverage.picks} 局 · 禁用率样本 {data.draftCoverage.bans} 局 · 完整选禁覆盖率样本 {data.draftCoverage.complete} 局。选用数据须双方各五人；禁用率与覆盖率采用双方各五个禁用位均已记录的标准 BP。</p>}
    <div className="season-statistics-table">
      {view === 'players' && <table><thead><tr><th>排名</th><th>选手 / 战队</th><th>{seasonMetricLabels[metric]}</th><th>出场 / 已确认胜负</th><th>胜率</th><th>K / D / A 合计</th><th>英雄池</th></tr></thead><tbody>{rows.map((p, index) => <tr key={p.id}><td>{index + 1}</td><td><button className="season-player-button" onClick={() => setSpotlight(p.id)}>{p.name}</button><small>{p.teamName}</small></td><td>{valueText(seasonMetricValue(p, metric), metric)}</td><td>{p.games} / {p.resolvedGames}</td><td>{rate(p.winRate)}</td><td>{p.scoreGames ? `${p.kills} / ${p.deaths} / ${p.assists}` : '—'}<small>{p.scoreGames} 局有效计分</small></td><td>{p.championPool.map(c => `${c.name} ${c.games}`).join(' · ')}</td></tr>)}</tbody></table>}
      {view === 'champions' && <table><thead><tr><th>英雄</th><th>选用</th><th>禁用</th><th>选用率</th><th>禁用率</th><th>选禁覆盖率</th><th>胜率</th><th>已确认胜负的选用局数</th></tr></thead><tbody>{data.champions.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.picks}</td><td>{c.bans}</td><td>{rate(c.pickRate)}</td><td>{rate(c.banRate)}</td><td>{rate(c.presenceRate)}</td><td>{rate(c.winRate)}</td><td>{c.resolvedPicks}</td></tr>)}</tbody></table>}
      {view === 'head-to-head' && <table><thead><tr><th>战队 A</th><th>战队 B</th><th>已归档局数</th><th>单局胜负 A : B</th><th>待确认</th><th>已完成大场</th><th>大场胜负 A : B</th></tr></thead><tbody>{data.headToHead.map(h => <tr key={JSON.stringify([h.teamA, h.teamB])}><td>{h.nameA}</td><td>{h.nameB}</td><td>{h.games}</td><td>{h.winsA} : {h.winsB}</td><td>{h.unresolved}</td><td>{h.matches}</td><td>{h.matchWinsA} : {h.matchWinsB}</td></tr>)}</tbody></table>}
    </div>
    {(!data.games || view === 'players' && !rows.length) && <div className="season-statistics-empty">{data.games ? '当前出场门槛和指标下没有可用选手数据。' : '完成比赛并归档后，选手排行、英雄选禁和单局交手数据会在这里生成。'}</div>}
    <p className="season-statistics-note">胜率按胜方已确认的对局计算；缺失数据按各指标的有效局数计算。KDA =（击杀 + 助攻）÷ max(1, 死亡)；参团率按有效五人计分累计；伤害占比为完整五人伤害局的平均占比。大场交手取已完成赛程，人工补录赛果保留在大场统计中。</p>
    {selectedPlayer && <div className="season-statistics-spotlight"><PlayerSpotlight player={selectedPlayer} /></div>}
  </section>;
}

function PlayerSpotlight({ player: p }: { player: SeasonPlayer }) {
  return <><div className="season-spotlight-identity">{p.portrait && <img src={p.portrait} alt="" />}<div><small>{p.teamName}</small><h3>{p.name}</h3><p>{p.games} 局出场 · {p.wins} 胜 · {p.championPool.length} 位英雄</p></div></div><div className="season-spotlight-metrics">{(['kda', 'winRate', 'killParticipation', 'damageShare', 'damagePerMinute', 'vision'] as const).map(metric => <div key={metric}><span>{seasonMetricLabels[metric]}</span><strong>{valueText(seasonMetricValue(p, metric), metric)}</strong></div>)}</div><div className="season-spotlight-pool">{p.championPool.slice(0, 8).map(c => <div key={c.id}><strong>{c.name}</strong><span>{c.games} 局 · {rate(c.winRate)} 胜率</span></div>)}</div></>;
}

export function SeasonStatisticsOverlay({ state, tournamentId, metric = 'kda', spotlightPlayerId, minimumGames = 1 }: { state: BroadcastState; tournamentId?: string; metric?: SeasonMetric; spotlightPlayerId?: string; minimumGames?: number }) {
  const data = useMemo(() => seasonStatistics(state, tournamentId), [state, tournamentId]);
  const selectedMetric = Object.hasOwn(seasonMetricLabels, metric) ? metric : 'kda';
  const player = data.players.find(p => p.id === spotlightPlayerId);
  const rows = seasonLeaderboard(data, selectedMetric, Number.isFinite(minimumGames) ? Math.max(1, minimumGames) : 1).slice(0, 5);
  return <div className="season-overlay"><header><span>RIFTCAST · SEASON STATISTICS</span><h1>{player ? '赛季选手聚焦' : seasonMetricLabels[selectedMetric] + ' · 赛季排行榜'}</h1><p>{data.title} · {data.games} 局归档</p></header>{player ? <div className="season-overlay-spotlight"><PlayerSpotlight player={player} /></div> : <div className="season-overlay-ranking">{rows.map((p, index) => <article key={p.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{p.name}</strong><span>{p.teamName} · {p.games} 局</span></div><em>{valueText(seasonMetricValue(p, selectedMetric), selectedMetric)}</em></article>)}{!rows.length && <p className="season-overlay-empty">等待已归档比赛数据</p>}</div>}<footer>{player ? '已归档比赛 · 选手赛季表现' : `统计指标：${seasonMetricLabels[selectedMetric]}`} · 缺失数据保留为空</footer></div>;
}
