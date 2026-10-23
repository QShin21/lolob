import type { BroadcastState, Side } from './types';
import { seasonStatistics } from './season-statistics';

export interface DraftStatisticsSettings { source:'off'|'all'|'current'|'tournament'; tournamentId?:string }
export const draftStatisticsDefaults:DraftStatisticsSettings={source:'off'};
export function validateDraftStatistics(value:unknown):DraftStatisticsSettings {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('BP 统计数据源格式无效');
  const v=value as Record<string,unknown>;
  if(Object.keys(v).some(k=>!['source','tournamentId'].includes(k))||!['off','all','current','tournament'].includes(String(v.source)))throw new Error('选择有效的 BP 统计数据源');
  if(v.source==='tournament'&&(typeof v.tournamentId!=='string'||!v.tournamentId.trim()||v.tournamentId.length>150||/[\u0000-\u001f\u007f]/.test(v.tournamentId)))throw new Error('请选择统计赛事');
  return {source:v.source as DraftStatisticsSettings['source'],...(v.source==='tournament'?{tournamentId:v.tournamentId as string}:{})};
}
export function draftStatisticsTarget(state:BroadcastState):{id:string;side:Side;kind:'预选'|'已选'}|undefined {
  const side=state.draft.activeTeam,hover=state.draft[`${side}Preselect`]?.find(Boolean);
  if(!state.draft.locked&&hover)return{id:hover,side,kind:'预选'};
  const selected=state.players.find(p=>p.id===state.selectedPlayerId&&state.draft[`${p.team}Picks`].includes(p.championId));
  if(selected)return{id:selected.championId,side:selected.team,kind:'已选'};
  const id=state.draft[`${side}Picks`].filter(Boolean).at(-1);if(id)return{id,side,kind:'已选'};
  return undefined;
}
export function currentDraftTournament(state:BroadcastState):string|undefined {
  return state.schedule.find(m=>state.match.seriesId===`${state.mode}:schedule:${m.id}`)?.tournament?.tournamentId;
}
export function draftStatistics(state:BroadcastState){
  const config=state.overlay.draftStatistics??draftStatisticsDefaults,target=draftStatisticsTarget(state);
  const tournamentId=config.source==='current'?currentDraftTournament(state):config.source==='tournament'?config.tournamentId:undefined;
  const missing=config.source==='current'&&!tournamentId||config.source==='tournament'&&!tournamentId;
  const data=seasonStatistics(missing?{...state,gameResults:[]}:state,tournamentId),row=target?data.champions.find(c=>c.id===target.id):undefined;
  const title=config.source==='all'?'全部本地归档':config.source==='current'&&!tournamentId?'当前比赛未关联赛事':state.tournaments?.find(t=>t.id===tournamentId)?.config.name??(tournamentId?'指定赛事':'统计已关闭');
  const pickSamples=data.draftCoverage.picks,banSamples=data.draftCoverage.bans,winSamples=row?.resolvedPicks??0;
  return {enabled:config.source!=='off',title,target,games:data.games,picks:row?.picks??0,bans:row?.bans??0,wins:row?.wins??0,pickSamples,banSamples,winSamples,
    pickRate:pickSamples>0?(row?.picks??0)/pickSamples:null,banRate:banSamples>0?(row?.bans??0)/banSamples:null,winRate:winSamples>0?(row?.wins??0)/winSamples:null};
}
