import {FitName} from '../FitName';
import type {BroadcastState,Champion,Player,Side} from '../../../shared/types';
import {bottomPlayers} from '../../../server/bottom-scoreboard';
import {lineupRunes} from '../../../shared/lineup-runes';
import {runeImage} from '../../../shared/player-assets';
import {championFor,getTeam} from '../../lib';
import banners from '../../../shared/lineup-banner-catalog.json';
const bannerUrls=new Map(banners.champions.map(c=>[c.id,c.url]));
import {TeamMark} from './ProgramPrimitives';
import './rune-lineup.css';
const roles=['上单','打野','中单','下路','辅助'];
export function Lane({index}:{index:number}){return <svg viewBox="0 0 40 40" aria-label={roles[index]} role="img">{index===1?<path d="M8 7l9 12-2-15 7 12 9-12-5 20 8-9-10 19h-7L5 17l10 8z"/>:index===4?<path d="M4 10l13 3 3 7 3-7 13-3-8 12-5 2-1 12h-4l-1-12-5-2zM15 5h10l-5 7z"/>:<>{index===0?<><path d="M5 5h30l-7 7H12v16l-7 7z"/><path d="M17 17h11v11H17zM35 13v22H13l5-5h12V18z" opacity=".3"/></>:index===2?<><path d="M5 5h21l-6 6h-9v9l-6 6zM35 35H14l6-6h9v-9l6-6z" opacity=".3"/><path d="M5 29L29 5h7v6L11 36H5z"/></>:<><path d="M35 35H5l7-7h16V12l7-7z"/><path d="M12 12h11v11H12zM5 27V5h22l-5 5H10v12z" opacity=".3"/></>}</>}</svg>}
function Row({player,side,champions}:{player?:Player;side:Side;champions:Champion[]}){
 const champion=championFor(champions,player?.championId||'');const runes=lineupRunes(player);
 return <article className={`rl-card ${side}`}><div className="rl-art">{champion&&<img src={bannerUrls.get(champion.id)} alt={champion.name}/>}</div><div className="rl-info"><FitName>{player?.name||'待确认选手'}</FitName><div className="rl-runes" aria-label={`${player?.name||'选手'}符文`}>{runes.map((id,i)=><span key={i} className={runes.length===6&&i===4?'rl-secondary':undefined} title={`符文 ${id}`} data-rune-id={id}><img src={runeImage(id)} alt={`符文 ${id}`}/></span>)}</div></div></article>;
}
export function Lineup({state,champions}:{state:BroadcastState;champions:Champion[]}){
 const blue=bottomPlayers(state,'blue'),red=bottomPlayers(state,'red');
 return <section className="rune-lineup"><div className="rl-caption"><span>{state.match.title}<br/>{state.match.subtitle}</span><span>STARTING<br/>LINEUP</span></div><header className="rl-header"><strong className="rl-tag">{getTeam(state,'blue')?.tag}</strong><TeamMark team={getTeam(state,'blue')}/><b className="rl-score blue">{state.match.blueScore}</b><strong className="rl-game">GAME{state.match.game}</strong><b className="rl-score red">{state.match.redScore}</b><TeamMark team={getTeam(state,'red')}/><strong className="rl-tag">{getTeam(state,'red')?.tag}</strong></header><div className="rl-rows">{roles.map((role,i)=><div className="rl-pair" key={role}><Row player={blue[i]} side="blue" champions={champions}/><div className="rl-lane"><Lane index={i}/></div><Row player={red[i]} side="red" champions={champions}/></div>)}</div><footer><span>{state.match.format}</span><span/><span>RIFTCAST</span></footer></section>;
}
