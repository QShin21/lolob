import type { BroadcastAction, BroadcastState, Champion, Player, Scene, Side } from '../shared/types';
export const sceneInfo: Record<Scene, { name: string; description: string; shortcut: string }> = {
  standby: { name: '赛前倒计时', description: '赛事开场 · 倒计时', shortcut: '1' },
  draft: { name: 'BP 选人', description: '英雄选择 · 禁用列表', shortcut: '2' },
  lineup: { name: '首发对位', description: '选手阵容 · 英雄展示', shortcut: '3' },
  live: { name: '局内计分板', description: '比分 · 选手 · 资源', shortcut: '4' },
  teamfight: { name: '团战视图', description: '原生视角 · 游戏内按 A', shortcut: 'T' },
  'gold-ranking': { name: '十人经济排行', description: '累计经济 · 全场排序', shortcut: 'G' },
  economy: { name: '经济曲线', description: '经济走势 · 领先差值', shortcut: '5' },
  ranking: { name: '选手数据榜', description: 'KDA · 补刀 · 装备', shortcut: '6' },
  schedule: { name: '赛程看板', description: '赛程 · BO 比分', shortcut: '7' },
  postgame: { name: '赛后报告', description: '对局统计 · 高光选手', shortcut: '8' },
  interview: { name: '赛后采访', description: '选手名牌 · 采访标题', shortcut: '9' },
};
export const time = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
export const gold = (value: number | null) => value == null ? '—' : `${(value / 1000).toFixed(1)}k`;
export const getTeam = (state: BroadcastState, side: Side) => state.teams.find(t => t.id === state.match[side === 'blue' ? 'blueTeamId' : 'redTeamId']) ?? state.teams[side === 'blue' ? 0 : 1];
export function championFor(champions: Champion[], id: string) { return champions.find(c => c.id === id || String(c.key) === id); }
export const playerKda = (p?: Player, compact = false) => !p || p.statsAvailable === false ? '—' : [p.kills, p.deaths, p.assists].join(compact ? '/' : ' / ');
export const playerCs = (p?: Player) => !p || p.statsAvailable === false ? '—' : p.cs;
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('riftcast-control-token');
  const seat=sessionStorage.getItem('riftcast-seat-token');
  const response = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-Control-Token': token } : {}),...(seat?{'X-Seat-Token':seat}:{}), ...init?.headers } });
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || error.message || `请求失败 (${response.status})`); }
  return response.json();
}
export const dispatch = (action: BroadcastAction) => api<BroadcastState>('/api/action', { method: 'POST', body: JSON.stringify(action) });
export function outputUrl(preview=false) {
  const url=new URL('/overlay',location.origin);
  const token=new URLSearchParams(location.search).get('token')||sessionStorage.getItem('riftcast-control-token');
  if(preview)url.searchParams.set('preview','1');
  if(token)url.searchParams.set('token',token);
  return url.href;
}
