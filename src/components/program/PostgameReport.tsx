import {matchupGoldShares} from '../../../shared/postgame-gold';
import { currentOcrMatch, postgameOcrView } from '../../../shared/hud-ocr';
import type {BroadcastState,Champion,Player,Side} from '../../../shared/types';
import {currentGameResult} from '../../../shared/game-results';
import {getTeam,gold,playerKda} from '../../lib';
import {GameTime} from '../GameTime';
import {EconomyChart} from '../EconomyChart';
import {FitName} from '../FitName';
import type {ItemAssets} from '../useItemCatalog';
import {ChampionImage,Equipment,TeamMark,sidePlayers} from './ProgramPrimitives';
import {Lane} from './RuneLineup';
import {lineupRunes} from '../../../shared/lineup-runes';
import {runeImage} from '../../../shared/player-assets';
import './postgame-report.css';
const sides:Side[]=['blue','red'];
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function share(player:Player|undefined,players:Player[],key:'damageDealt'|'damageTaken') {if(!player||!valid(player[key])||players.length!==5||players.some(p=>!valid(p[key])))return null;const total=players.reduce((sum,p)=>sum+p[key]!,0);return total>0?player[key]!/total*100:0;}
function Ring({value}:{value:number|null}){return <div className="pr-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="38" pathLength="100" strokeDasharray={`${value??0} 100`} transform="rotate(-90 50 50)"/></svg><b>{value===null?'—':`${Math.round(value)}%`}</b></div>}
export function Postgame({state,champions,items,version}:{state:BroadcastState;champions:Champion[];items:ItemAssets;version:string}){
 state=postgameOcrView(state);
 const ocr=currentOcrMatch(state);
 const result=currentGameResult(state),page=state.overlay.postgamePage??1,rosters={blue:sidePlayers(state,'blue'),red:sidePlayers(state,'red')};
 const totalKda=(side:Side)=>rosters[side].length===5&&rosters[side].every(p=>p.statsAvailable!==false)?['kills','deaths','assists'].map(key=>rosters[side].reduce((s,p)=>s+p[key as 'kills'],0)).join('/'):'—';
 const objective=(side:Side,key:'towers'|'dragons'|'barons'|'voidgrubs')=>state.mode==='live'?(ocr?.objectives[side][key]?.value??'未采集'):(state.stats[side].objectivesAvailable===false?'未提供':state.stats[side][key]??'未提供');
 const metrics=[['KDA',...sides.map(totalKda)],['GOLD · 团队经济',...sides.map(s=>gold(state.stats[s].gold))],...([['TURRETS · 防御塔','towers'],['DRAKES · 小龙','dragons'],['BARONS · 大龙','barons'],['VOIDGRUBS · 虚空巢虫','voidgrubs']] as const).map(([label,key])=>[label,...sides.map(s=>objective(s,key))])];
 const card=(p:Player|undefined,side:Side)=><article className={`pr-card ${side}`}><ChampionImage champions={champions} id={p?.championId??''} kind="splash" art="lineup"/><FitName>{p?.name??'等待选手'}</FitName><b className="pr-kda">{playerKda(p,true)}</b><div className="pr-runes">{lineupRunes(p).map(id=><img key={id} src={runeImage(id)}/>)}</div><Equipment player={p} items={items} version={version}/></article>;
 return <section className={`cast-postgame postgame-report page-${page}`}><div className="pr-caption"><span>{state.match.title}<br/>{state.match.subtitle}</span><span>POST GAME REPORT · {page}/2</span></div><header className="pr-header"><strong>{getTeam(state,'blue')?.tag}</strong><TeamMark team={getTeam(state,'blue')}/><b className="blue">{result?.winner?(result.winner==='blue'?'WIN':'LOSS'):'待确认'}{page===2&&` ${state.match.blueScore}`}</b><div><GameTime state={state}/><small>GAME TIME · 第 {state.match.game} 局</small></div><b className="red">{page===2&&`${state.match.redScore} `}{result?.winner?(result.winner==='red'?'WIN':'LOSS'):'待确认'}</b><TeamMark team={getTeam(state,'red')}/><strong>{getTeam(state,'red')?.tag}</strong></header>
 {page===1?<div className="pr-overview"><div className="pr-gold">{Array.from({length:5},(_,i)=>{
   const shares=matchupGoldShares(rosters.blue[i]?.gold,rosters.red[i]?.gold);
   return <div className="pr-gold-pair" key={i}>{sides.map(side=>{const p=rosters[side][i];return <div className={`pr-gold-player ${side}`} key={side}><ChampionImage champions={champions} id={p?.championId??''}/><div><div className="pr-gold-label"><FitName>{p?.name??'等待选手'}</FitName><b>{valid(p?.gold)?gold(p.gold):'未采集'}</b></div><div className="pr-bar" aria-hidden="true"/></div></div>})}
    <div className={`pr-gold-comparison ${shares?'':'is-unavailable'}`} aria-label={shares?`对位经济比例 蓝方 ${(shares[0]*100).toFixed(1)}% 红方 ${(shares[1]*100).toFixed(1)}%`:'对位经济比例暂无有效数据'}>
      <i className="blue" style={{flexGrow:shares?.[0]??1}}/><i className="red" style={{flexGrow:shares?.[1]??1}}/>
    </div>
   </div>;
 })}<p>GOLD EARNED · 英雄经济</p></div><div className="pr-metrics">{metrics.map(([label,b,r])=><div key={label}><b>{b}</b><span>{label}</span><b>{r}</b></div>)}</div><div className="pr-bans">{sides.map(side=><div key={side}>{Array.from({length:5},(_,i)=><ChampionImage key={i} champions={champions} id={state.draft[`${side}Bans`][i]??''} kind="splash"/>)}</div>)}<strong>BANS</strong></div><div className="pr-economy"><EconomyChart state={state}/></div></div>:<div className="pr-matchups"><div className="pr-table-heading blue"><span/><span>DMG%</span><span>DT%</span><span>KP%</span></div><div/><div className="pr-table-heading red"><span>DMG%</span><span>DT%</span><span>KP%</span><span/></div>{Array.from({length:5},(_,i)=><div className="pr-matchup" key={i}>{sides.map(side=>{const p=rosters[side][i],kills=state.stats[side].kills,available=rosters[side].length===5&&rosters[side].every(p=>p.statsAvailable!==false);return <div className={`pr-player ${side}`} key={side}>{side==='blue'&&card(p,side)}<Ring value={share(p,rosters[side],'damageDealt')}/><Ring value={share(p,rosters[side],'damageTaken')}/><Ring value={p&&available?(kills>0?Math.min(100,(p.kills+p.assists)/kills*100):0):null}/>{side==='red'&&card(p,side)}</div>})}<div className="pr-lane"><Lane index={i}/></div></div>)}</div>}
 <footer><span>{state.match.format} · {state.match.blueScore}:{state.match.redScore}</span><span>{result?'本局已保存数据':'当前观测 · 终局尚未确认'}{state.mode==='live'&&' · OCR 最后有效样本'} · 未采集表示缺少 OCR 样本{page===2?' · DMG 伤害占比 / DT 承伤占比 / KP 参团率':''}</span><span>RIFTCAST · {page}/2</span></footer></section>;
}
