import { useEffect, useState } from 'react';
import { Package, ShieldCheck, UserRound } from 'lucide-react';
import type { BroadcastState, Champion } from '../../shared/types';
import { currentGameResult, frozenGameState, gameResultAwaitingTerminalSample } from '../../shared/game-results';
import { championFor, getTeam, gold, playerCs, playerKda } from '../lib';
import { dataDragonItemImage, useItemCatalog } from './useItemCatalog';
import type { ItemAssets } from './useItemCatalog';
import './player-build.css';
import { GameTime } from './GameTime';

function BuildImage({ src, alt, className = '', kind = 'item' }: { src?: string; alt: string; className?: string; kind?: 'item' | 'portrait' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className={`pb-image ${className} ${!src || failed ? 'pb-image-unavailable' : ''}`}>
    {src && !failed ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} /> : <span role="img" aria-label={src ? `${alt}图片加载失败` : alt}>{kind === 'portrait' ? <UserRound /> : <Package />}</span>}
  </div>;
}

const numberText = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : String(value);

function EquipmentStrip({ ids, version, catalog }: { ids: number[]; version: string; catalog: ItemAssets }) {
  return <div className="pb-items">{Array.from({ length: 7 }, (_, index) => {
    const id = ids[index];
    const item = id ? catalog[id] : undefined;
    const name = id ? item?.name || '装备素材加载中' : '—';
    return <div key={index} className={`pb-item ${index===6?'pb-trinket':''} ${!id ? 'pb-item-empty' : ''}`} title={id ? name : index===6?'饰品栏':'空装备栏'}>
      <BuildImage src={item?.image || dataDragonItemImage(version, id)} alt={id ? name : '空装备栏'} />
      <span>{name}</span>
    </div>;
  })}</div>;
}

export function PlayerBuild({ state: sourceState, champions, output = false }: { state: BroadcastState; champions: Champion[]; output?: boolean }) {
  const result=currentGameResult(sourceState),state=frozenGameState(sourceState);
  const player = state.players.find(p => p.id === state.selectedPlayerId);
  const catalog = useItemCatalog(champions);
  if (!player) return null;
  const team = getTeam(state, player.team);
  const champion = championFor(champions, player.championId);
  const portrait = player.portrait || team?.players.find(p => p.name === player.name)?.portrait || team?.players.find(p => p.role === player.role)?.portrait;
  const items = (player.items || []).filter(id => Number.isInteger(id) && id > 0);
  const slots=player.itemSlots||player.items||[];
  const equipmentValue=items.length&&items.every(id=>catalog.items[id]?.gold!==undefined)?items.reduce((sum,id)=>sum+catalog.items[id].gold!,0):null;
  const runes = (player.runes || []).filter(rune => typeof rune === 'string' && rune.trim());
  const stats = [
    ['K / D / A', playerKda(player)],
    ['等级', numberText(player.level)], ['补刀', playerCs(player)], [player.gold==null?'装备目录价值':'累计经济', gold(player.gold??equipmentValue)],
  ];
  if (output) return <section className={`player-build pb-output pb-${player.team}`} aria-label={`${player.name}选手装备分析`}>
    <header className="pb-focus-header"><strong>PLAYER FOCUS <span>{result?`第 ${result.game} 局${gameResultAwaitingTerminalSample(result)?'已保存数据':'冻结数据'}`:'选手装备'}</span></strong><span>{team?.tag || (player.team === 'blue' ? 'BLUE' : 'RED')} <i>/</i> {player.role || '—'}</span><time><GameTime state={state}/></time></header>
    <div className="pb-focus-body">
      <div className={`pb-focus-portrait ${portrait ? 'has-portrait' : ''}`}><BuildImage src={portrait || champion?.image} alt={portrait ? `${player.name}选手照片` : `${player.championName || '英雄'}头像`} kind="portrait" />{portrait && <BuildImage src={champion?.image} alt={player.championName || '英雄头像'} className="pb-focus-champion" />}</div>
      <div className="pb-focus-name"><strong>{player.name}</strong><span>{player.championName || champion?.name || '—'}</span><small>{team?.name || '—'}</small></div>
      <div className="pb-focus-stats">{stats.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <div className="pb-focus-equipment"><div className="pb-focus-caption"><strong>ITEM BUILD</strong><span>六装备 / 饰品</span></div><EquipmentStrip ids={slots} version={catalog.version} catalog={catalog.items} /></div>
    </div>
    <footer className="pb-focus-footer"><span>RUNES <i>/</i> 符文</span><strong title={!runes.length ? 'API 未提供符文' : undefined}>{runes.join(' / ') || '—'}</strong><small>{result?`${gameResultAwaitingTerminalSample(result)?'ARCHIVED':'FINAL'} GAME ${result.game}`:state.mode === 'demo' ? 'DEMO DATA' : 'LIVE CLIENT DATA'}</small></footer>
  </section>;
  return <section className={`player-build panel pb-panel pb-${player.team}`} aria-label={`${player.name}选手装备与符文`}>
    <header className="panel-head"><div><small>PLAYER LOADOUT</small><h2>{result?`第 ${result.game} 局${gameResultAwaitingTerminalSample(result)?'已保存':'最终'}选手装备与符文`:'选手装备与符文'}</h2></div><span><GameTime state={state}/></span></header>
    <div className="pb-content">
      <div className="pb-profile">
        <BuildImage src={portrait || champion?.image} alt={portrait ? `${player.name}选手照片` : `${player.championName || '未选择英雄'}头像`} kind="portrait" className={portrait ? 'pb-portrait' : 'pb-champion'} />
        <div className="pb-identity"><span className="pb-team">{team?.tag || (player.team === 'blue' ? '蓝色方' : '红色方')} <i>·</i> {player.role || '待分路'}</span><strong>{player.name}</strong><span>{player.championName || champion?.name || '待选择英雄'}</span></div>
        {portrait && <BuildImage src={champion?.image} alt={player.championName || '英雄头像'} className="pb-champion-badge" />}
      </div>
      <div className="pb-detail">
        <div className="pb-stats">{stats.map(([label, value]) => <div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
        <div className="pb-section-title"><Package /><h3>装备</h3><span>{items.length ? `${items.length} 件 · 六装备与饰品栏` : '暂无装备数据'}</span></div>
        <EquipmentStrip ids={slots} version={catalog.version} catalog={catalog.items} />
        <div className="pb-section-title pb-rune-title"><ShieldCheck /><h3>符文</h3><span>客户端已提供字段</span></div>
        {runes.length ? <div className="pb-runes">{runes.map((rune, index) => <span key={`${index}-${rune}`}>{rune}</span>)}</div> : <p className="pb-empty-runes">API 未提供符文</p>}
        <p className="pb-data-note">{result?`第 ${result.game} 局${gameResultAwaitingTerminalSample(result)?'已保存观测数据':'冻结数据'}`:state.mode === 'demo' ? '演示选手数据' : '本机客户端数据'}{catalog.version ? ` · 静态素材版本 ${catalog.version}` : ' · 静态素材版本不可用'}{items.length > 0 && catalog.status !== 'ready' ? ' · 装备名称暂不可用，保留 ID' : ''}</p>
      </div>
    </div>
  </section>;
}
