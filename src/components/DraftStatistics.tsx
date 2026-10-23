import {useState}from'react';
import type{BroadcastState,Champion,StateContext}from'../../shared/types';
import{currentDraftTournament,draftStatistics,draftStatisticsDefaults,validateDraftStatistics,type DraftStatisticsSettings}from'../../shared/draft-statistics';
import{championFor}from'../lib';
import'./draft-statistics.css';

const rate=(value:number|null)=>value===null?'—':`${(value*100).toFixed(1)}%`;
export function DraftStatisticsOverlay({state,champions}:{state:BroadcastState;champions:Champion[]}){
 if(!state.overlay.draftStatistics||state.overlay.draftStatistics.source==='off')return null;
 const stats=draftStatistics(state),target=stats.target,name=target?championFor(champions,target.id)?.name??target.id:'';
 return <aside className={`draft-statistics ${state.overlay.draftLayout==='full-height'?'is-full-height':'is-bottom'}`} aria-label="BP 英雄统计">
  <header><strong>{name||'等待选中或预选英雄'}</strong><span>{target?`${target.side==='blue'?'蓝方':'红方'}${target.kind}`:'英雄数据'}</span></header>
  {target&&<div className="ds-metrics"><div><span>选用率</span><b>{rate(stats.pickRate)}</b><small>{stats.picks} 次 / {stats.pickSamples} 局选人样本</small></div><div><span>禁用率</span><b>{rate(stats.banRate)}</b><small>{stats.bans} 次 / {stats.banSamples} 局禁用样本</small></div><div><span>胜率</span><b>{rate(stats.winRate)}</b><small>{stats.wins} 胜 / {stats.winSamples} 次已确认出场</small></div></div>}
  <footer>来源：本地归档 · {stats.title} · {stats.games} 局<span>— 表示缺少有效样本</span></footer>
 </aside>;
}
export function DraftStatisticsControls({state,send,notify,seat,connected}:Pick<StateContext,'state'|'send'|'notify'|'seat'|'connected'>){
 const[draft,setDraft]=useState<DraftStatisticsSettings|null>(null),[busy,setBusy]=useState(false),config=draft??state.overlay.draftStatistics??draftStatisticsDefaults;
 const editable=connected!==false&&(!seat||['director','data'].includes(seat.role)),scope=currentDraftTournament(state);
 const save=async()=>{try{setBusy(true);const value=validateDraftStatistics(config);await send({type:'set-overlay',patch:{draftStatistics:value}});setDraft(null);notify('BP 统计数据源已保存到待播，请核对后 TAKE');}catch(e){notify(e instanceof Error?e.message:String(e),'error');}finally{setBusy(false);}};
 return <section className="draft-statistics-controls panel" aria-label="BP 统计数据源"><h3>BP 统计数据源</h3><div><label>数据范围<select aria-label="BP 统计数据范围" value={config.source} disabled={!editable||busy} onChange={e=>setDraft({source:e.target.value as DraftStatisticsSettings['source'],...(e.target.value==='tournament'?{tournamentId:config.tournamentId??state.tournaments?.[0]?.id??''}:{})})}><option value="off">关闭</option><option value="all">全部本地归档</option><option value="current">当前赛事</option><option value="tournament">指定赛事</option></select></label>{config.source==='tournament'&&<label>赛事<select aria-label="BP 统计赛事" value={config.tournamentId??''} disabled={!editable||busy} onChange={e=>setDraft({...config,tournamentId:e.target.value})}><option value="">请选择赛事</option>{state.tournaments?.map(t=><option value={t.id} key={t.id}>{t.config.name}</option>)}</select></label>}<button className="button" disabled={!editable||!draft||busy} onClick={()=>void save()}>保存 BP 统计</button></div><p className="muted">预选英雄优先；随后显示已选中的选手英雄或当前方最近选用英雄。选用率、禁用率按完整 BP 样本计算；胜率只计已确认胜方的出场。无有效分母显示 —。</p>{config.source==='current'&&!scope&&<p role="status">当前比赛未关联赛事，请从赛事赛程载入比赛，或选择全部本地归档。</p>}<small>来源为本机保存的比赛，设置进入待播后通过 TAKE 生效。</small></section>;
}
