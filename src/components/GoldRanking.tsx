import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, StateContext } from '../../shared/types';
import { goldRanking } from '../../shared/gold-ranking';
import { championFor, getTeam } from '../lib';
import './gold-ranking.css';

export function GoldRankingOverlay({ state, champions }: { state: BroadcastState; champions: Champion[] }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  const rows = goldRanking(state, now);
  return <section className="cast-gold-ranking" aria-label="十人经济排行">
    <header><span>GOLD RANKING</span><strong>十人经济排行</strong><small>累计金币</small></header>
    <div className="cast-gold-columns">{[0, 1].map(column => <ol key={column} start={column * 5 + 1} aria-label={column === 0 ? '第 1 至 5 名' : '第 6 至 10 名'}>
      {Array.from({ length: 5 }, (_, index) => {
        const row = rows[column * 5 + index], player = row?.player, champion = championFor(champions, player?.championId || '');
        return <li key={player?.id || index} className={`${player?.team || ''} ${row?.gold == null ? 'is-unavailable' : ''}`} data-player-id={player?.id} data-gold={row?.gold ?? ''} aria-label={`${row?.rank ? `第 ${row.rank} 名` : '等待经济'} ${player?.name || '等待选手'} ${row?.gold == null ? '未提供' : Math.round(row.gold)}`}>
          <span className="cast-gold-position">{row?.rank ?? '—'}</span>
          <span className="cast-gold-hero">{champion ? <img src={champion.image} alt={champion.name} /> : <span>—</span>}</span>
          <div className="cast-gold-track"><div className="cast-gold-identity"><strong>{player?.name || '等待选手'}</strong><small>{player ? getTeam(state, player.team)?.tag : ''}</small></div><span className="cast-gold-bar"><i style={{ width: `${row?.percentage || 0}%` }} /></span></div>
          <b className="cast-gold-amount">{row?.gold == null ? '—' : Math.round(row.gold).toLocaleString('zh-CN')}</b>
        </li>;
      })}
    </ol>)}</div>
  </section>;
}
export function GoldRankingControls({ state, send, notify }: StateContext) {
  const available = goldRanking(state).filter(row => row.gold !== null).length;
  return <section className="panel gold-ranking-controls"><div className="panel-head"><h2>十人经济排行</h2><span className="badge">{state.mode === 'demo' ? 'DEMO' : `${available} / 10 有效`}</span></div>
    <p className="muted">双方选手按累计经济从高到低统一排序。第 1–5 名在左列，第 6–10 名在右列；条形颜色对应队伍。缺少或过期的读数显示“—”。</p>
    <div className="inline-buttons"><button className="button small" onClick={() => void send({ type: 'preview-scene', scene: 'gold-ranking' }).catch(() => {})}>预监经济排行 · G</button><button className="button primary small" onClick={() => void send({ type: 'take', scene: 'gold-ranking' }).then(() => notify('十人经济排行已切入节目')).catch(() => {})}>切入经济排行</button></div>
  </section>;
}
