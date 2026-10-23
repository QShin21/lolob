import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, Player } from '../../shared/types';
import { bundledChampionVersion } from '../../shared/champion-art';
import { cachedResource } from '../../shared/resource-url';
import { normalizedSkinId, resolveSkin, skinCatalog, type ChampionSkin } from '../../shared/champion-skins';
import { liveAnalysisReady } from '../../shared/broadcast-analysis';
import { getTeam, time } from '../lib';
import { StyleText } from './StyleText';
import './skin-display.css';

const requests = new Map<string, Promise<ChampionSkin[]>>();
function loadSkins(version: string, champion: string) {
  const key = `${version}:${champion}`, prior = requests.get(key); if (prior) return prior;
  const request = (async () => {
    try {
      const response = await fetch(cachedResource(`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/champion/${champion}.json`), { credentials: 'omit', signal: AbortSignal.timeout(6000) });
      return response.ok ? skinCatalog(await response.json(), champion) : [];
    } catch { return []; }
  })();
  requests.set(key, request); void request.then(skins => { if (!skins.length) requests.delete(key); }); return request;
}
function SkinCard({ player, skins, ready, loaded }: { player: Player; skins: ChampionSkin[]; ready: boolean; loaded: boolean }) {
  const skin = ready ? resolveSkin(skins, player.championId, player.championName, player.skinId) : undefined;
  const [failed, setFailed] = useState('');
  const known = normalizedSkinId(player.skinId) !== undefined;
  return <article className="skin-card" data-player={player.id} data-skin={skin?.num} data-known={!!skin}>
    <div className="skin-art">{skin && failed !== skin.image ? <img src={skin.image} alt={skin.name} onError={() => setFailed(skin.image)}/> : <span>{!ready ? '等待有效局内数据' : !known ? '皮肤信息未提供' : !loaded ? '正在读取皮肤目录' : skin ? '皮肤原画暂不可用' : !skins.length ? '皮肤目录暂不可用' : `皮肤 #${player.skinId} · 目录未收录`}</span>}</div>
    <strong><StyleText target="analysisName" context={{ player }}>{player.name}</StyleText></strong><span>{player.championName}</span><b>{skin?.name ?? '—'}</b>{skin?.chroma && <small>炫彩 · 使用所属皮肤原画</small>}
  </article>;
}
export function SkinDisplay({ state, champions, now = Date.now() }: { state: BroadcastState; champions: Champion[]; now?: number }) {
  const configured = state.production?.versions.resources;
  const version = /^\d+\.\d+\.\d+$/.test(configured ?? '') ? configured! : champions.map(c => c.image.match(/\/cdn\/(\d+\.\d+\.\d+)\//)?.[1]).find(Boolean) || bundledChampionVersion;
  const ids = [...new Set(state.players.slice(0, 10).map(p => p.championId).filter(id => /^[A-Za-z0-9]{2,40}$/.test(id)))].sort(), key = `${version}:${ids.join(',')}`;
  const [catalog, setCatalog] = useState<{ key: string; values: Record<string, ChampionSkin[]> }>({ key: '', values: {} });
  useEffect(() => { let active = true; void Promise.all(ids.map(async id => [id, await loadSkins(version, id)] as const)).then(entries => { if (active) setCatalog({ key, values: Object.fromEntries(entries) }); }); return () => { active = false; }; }, [key]);
  const ready = liveAnalysisReady(state, now), loaded = catalog.key === key;
  return <section className="broadcast-analysis analysis-skin-display" aria-label="选手皮肤展示"><header><strong>选手皮肤展示</strong><span>{time(state.gameTime)}</span></header>
    {(['blue', 'red'] as const).map(side => <div className={`skin-team ${side}`} key={side}><h3>{getTeam(state, side)?.tag ?? side}</h3><div className="skin-cards">{state.players.filter(p => p.team === side).slice(0, 5).map(player => <SkinCard key={player.id} player={player} skins={loaded ? catalog.values[player.championId] ?? [] : []} loaded={loaded} ready={ready}/>)}</div></div>)}
    <footer>当前对局皮肤 · Riot 目录 {version} · 未提供的皮肤保持未知</footer>
  </section>;
}
