import { useEffect, useState } from 'react';
import type { BroadcastState, Champion, GameEvent, StateContext } from '../../shared/types';
import { combatReviewLabels, currentCombatReview, type CombatReviewMode } from '../../shared/combat-review';
import { championFor, time } from '../lib';
import './combat-review.css';

const number=(v:number|null|undefined)=>v==null?'—':Math.round(v).toLocaleString('en-US');
export function CombatReviewOverlay({state,champions}:{state:BroadcastState;champions:Champion[]}) {
  const [now,setNow]=useState(Date.now);useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(id);},[]);
  const mode=state.overlay.combatReviewMode??'off';if(mode==='off')return null;
  const review=currentCombatReview(state,now),selected=state.overlay.combatMomentId;
  const death=selected?review?.deaths.find(d=>d.id===selected):review?.deaths.at(-1),fight=selected?review?.fights.find(f=>f.id===selected):review?.fights.at(-1);
  const portrait=(id:string)=>{const c=championFor(champions,id);return c?<img src={c.image} alt={c.name}/>:null;};
  const allRows=mode==='death-recap'?death?.sources.map(s=>({player:s.source,damage:s.total}))??[]:mode==='fight-history'?fight?.rows??[]:[];
  const rows=allRows.slice(0,10);
  const maximum=Math.max(1,...rows.map(r=>r.damage??0));
  return <section className={`combat-review-overlay review-${mode}`} aria-label={combatReviewLabels[mode]}>
    <header><strong>{combatReviewLabels[mode]}</strong><span>{time(state.gameTime)}</span></header>
    {!review?<p className="cr-empty">等待有效逐次伤害样本</p>:mode==='damage-flow'?<><p>最近 15 秒 · 英雄 → 受击英雄{!review.flowComplete?' · 采集范围不完整':''}</p><div className="cr-flows">{review.flows.slice(0,12).map(f=><article key={`${f.source.id}:${f.target.id}`}><span>{portrait(f.source.champion)}{f.source.name}</span><div><b>{number(f.total)}</b><i style={{width:`${Math.max(2,f.total/Math.max(1,...review.flows.map(v=>v.total))*100)}%`}}/></div><span>{portrait(f.target.champion)}{f.target.name}</span></article>)}</div>{!review.flows.length&&<p className="cr-empty">本窗口暂无已采集的英雄伤害</p>}</>:mode==='objective-dps'?<><p>最近 5 秒 · 已识别目标的英雄伤害 / 窗口秒数</p><div className="cr-objectives">{review.objectives.slice(0,3).map(o=><article key={o.id}><h3>{{dragons:'巨龙',barons:'男爵',heralds:'先锋',voidgrubs:'虚空巢虫',elders:'远古龙'}[o.kind]??o.kind} <small>#{o.id}</small><b>{number(o.dps)} DPS</b></h3>{o.rows.slice(0,10).map(r=><div key={r.player.id}>{portrait(r.player.champion)}<span>{r.player.name}</span><b>{number(r.dps)} /s</b></div>)}{!o.complete&&<small>窗口采集不完整，伤害速度保持空值</small>}</article>)}</div>{!review.objectives.length&&<p className="cr-empty">等待目标身份和伤害事件</p>}</>:<>
      <p>{mode==='death-recap'?death?`${death.victim.name} · ${time(death.from)} — ${time(death.time)} · 物理 / 魔法 / 真实来源汇总`:'选择已采集的死亡事件':fight?`${time(fight.start)} — ${time(fight.end)} · ${fight.participants.length} 人交战`:'选择已采集的团战'}</p>
      <div className="cr-damage-rows">{rows.map(r=><article key={r.player.id} className={r.player.team}><span>{portrait(r.player.champion)}{r.player.name}</span><div><i style={{width:`${(r.damage??0)/maximum*100}%`}}/></div><b>{number(r.damage)}</b>{mode==='death-recap'&&death&&(()=>{const s=death.sources.find(v=>v.source.id===r.player.id)!;return <small>{number(s.physical)} / {number(s.magic)} / {number(s.trueDamage)}</small>;})()}</article>)}</div>
      {mode==='fight-history'&&fight&&<svg className="cr-fight-timeline" viewBox="0 0 1200 100" role="img" aria-label="所选团战双方累计伤害曲线">{(['blue','red'] as const).map(side=>{const max=Math.max(1,...fight.samples.flatMap(s=>[s.blue??0,s.red??0])),x=(t:number)=>(t-fight.start)/Math.max(1,fight.end-fight.start)*1180+10,y=(v:number)=>90-v/max*80;return <g key={side} stroke={side==='blue'?'#54b9f3':'#f58086'}>{fight.samples.map((s,i)=>{const a=fight.samples[i-1];return a&&a[side]!==null&&s[side]!==null?<line key={i} x1={x(a.time)} y1={y(a[side]!)} x2={x(s.time)} y2={y(s[side]!)} strokeWidth="3"/>:null;})}</g>;})}</svg>}
      {(mode==='death-recap'&&death&&!death.complete||mode==='fight-history'&&fight&&!fight.complete)&&<small>片段采集范围不完整，按已获得事件显示并保留缺失标记。</small>}
    </>}
    <footer>{allRows.length>10?`显示前 10 个来源 · 其余 ${allRows.length-10} 个来源合计 ${number(allRows.slice(10).reduce((sum,r)=>sum+(r.damage??0),0))} · `:''}逐次观战 / 回放伤害 · 当前游戏时间范围内的样本</footer>
  </section>;
}
export function CombatReviewControls({state,send,notify}:Pick<StateContext,'state'|'send'|'notify'>){
  const review=state.combatReview;
  const choose=async(mode:CombatReviewMode,id='')=>{try{await send({type:'set-overlay',patch:{combatReviewMode:mode,combatMomentId:id,analysisMode:'off'}});if(mode!=='off')await send({type:'preview-scene',scene:'live'});notify(mode==='off'?'已在待播收起逐次伤害分析':'已准备分析图形，请核对预监后 TAKE');}catch{}};
  return <section className="combat-review-controls panel" aria-label="战斗分析与历史团战"><div className="panel-head"><h2>战斗分析与历史团战</h2><span>{review?`${review.fights.length} 段团战 · ${review.deaths.length} 次死亡`:'等待逐次伤害数据'}</span></div><p className="muted">后台按伤害关系跟踪团战，可在任意节目场景下积累。选择图形后准备到预监。</p><div className="cr-control-buttons">{(Object.entries(combatReviewLabels) as [CombatReviewMode,string][]).map(([mode,label])=><button className="button small" key={mode} onClick={()=>void choose(mode)}>{label}</button>)}</div><div className="cr-history-columns"><div><h3>已采集团战</h3>{review?.fights.slice().reverse().map(f=><button className="button" key={f.id} onClick={()=>void choose('fight-history',f.id)}>{time(f.start)} — {time(f.end)} · {f.participants.length}人 {f.complete?'':'· 数据不完整'}</button>)}</div><div><h3>死亡回顾</h3>{review?.deaths.slice().reverse().map(d=><button className="button" key={d.id} onClick={()=>void choose('death-recap',d.id)}>{time(d.time)} · {d.victim.name} {d.complete?'':'· 数据不完整'}</button>)}</div></div></section>;
}
export function eventGraphic(state:BroadcastState,event:GameEvent):{label:string;patch:Partial<BroadcastState['overlay']>}|undefined {
  if(event.type==='ChampionKill'){
    const deaths=state.combatReview?.deaths.filter(d=>Math.abs(d.time-event.time)<1);
    const death=deaths?.find(d=>d.victim.name===event.victim||d.victim.champion===event.victim)??(deaths?.length===1?deaths[0]:undefined);
    return death?{label:'准备死亡回顾',patch:{combatReviewMode:'death-recap',combatMomentId:death.id,analysisMode:'off'}}:{label:'准备参团分析',patch:{combatReviewMode:'off',analysisMode:'participation'}};
  }
  if(/Dragon|Baron|Herald|Horde|VoidGrub|Elder/i.test(event.type))return {label:'准备资源伤害',patch:{combatReviewMode:'objective-dps',combatMomentId:'',analysisMode:'off',objectives:true}};
  if(/Inhib/i.test(event.type))return {label:'准备水晶计时',patch:{inhibitorTimers:true}};
  if(/Turret|Tower/i.test(event.type))return {label:'准备全局计分板',patch:{fullScoreboard:true,scoreboard:true}};
  if(/Ace|Multikill|FirstBlood/i.test(event.type))return {label:'准备伤害分析',patch:{combatReviewMode:'off',analysisMode:'damage'}};
}
