import type { StateContext } from '../../shared/types';
import { championFor, getTeam } from '../lib';

export function FearlessControls({state,champions,send,notify}:StateContext) {
  const games=(state.draftHistory||[]).filter(g=>g.seriesId===state.match.seriesId&&g.game<state.match.game).sort((a,b)=>a.game-b.game);
  return <section className="panel fearless-controls"><div className="panel-head"><h2>全局 BP · GAME {state.match.game}</h2><div className="inline-buttons"><button className="button small" onClick={()=>void send({type:'set-match',patch:{game:state.match.game+1}}).then(()=>notify('已进入下一局，历史英雄继续全局禁用')).catch(()=>{})}>下一局</button><button className="button small" onClick={()=>void send({type:'set-match',patch:{game:1,seriesId:`series-${crypto.randomUUID()}`}}).then(()=>notify('已开启新系列赛')).catch(()=>{})}>新系列赛</button></div></div><p className="muted">最终选人确认进入对局后自动登记。此前各局双方已选英雄将在 BP 上方按 GAME 显示；前局已用英雄会禁选。换边后历史跟随战队。</p>{!games.length&&<p className="muted">当前系列尚无前局记录。</p>}{games.map(g=><div className="fearless-history-row" key={g.game}><b>GAME {g.game}</b>{(['blue','red']as const).map(side=>{const teamId=state.match[`${side}TeamId`];const ids=g.blueTeamId===teamId?g.bluePicks:g.redPicks;return <div key={side}><span>{getTeam(state,side)?.tag}</span>{ids.map(id=>{const c=championFor(champions,id);return <span className="fearless-champion" key={id} title={c?.name||id}>{c&&<img src={c.image} alt={c.name}/>}<small>{c?.name||id}</small></span>;})}</div>;})}</div>)}</section>;
}
export function usedDraftChampions(state:StateContext['state']) {
  return new Set((state.draftHistory||[]).filter(g=>g.seriesId===state.match.seriesId&&g.game<state.match.game).flatMap(g=>[...g.bluePicks,...g.redPicks]));
}
