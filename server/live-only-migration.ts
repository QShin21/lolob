import type { BroadcastState, Recording, Team } from '../shared/types';

// Compatibility is read-only: legacy demonstration data is discarded during upgrade.
const legacyTeams: Record<string, [string,string,string,string[]]> = {
  azure:['苍穹竞技','AZR','#48b8ef',['山岚','追风','星河','流光','青禾']],
  ember:['赤焰战队','EMB','#ef665e',['赤霄','临渊','长夜','烬羽','望舒']],
  jade:['青玉之锋','JAD','#78d3ac',['竹影','听雨','云舟','晚照','见月']],
  storm:['雷霆先锋','STM','#bd94f0',['雷鸣','疾行','远帆','破晓','风语']],
};
function untouchedTeam(team:Team):boolean {
  const expected=legacyTeams[team.id];
  return !!expected && team.name===expected[0] && team.tag===expected[1] && team.color===expected[2] && !team.logo &&
    team.players.length===5 && team.players.every((p,i)=>p.name===expected[3][i] && p.role===['上单','打野','中单','下路','辅助'][i] &&
      !p.account && !p.portrait && (!p.id || p.id===`${team.id}:${p.role}`));
}
const legacySeries=(value?:string)=>!!value&&(value==='demo-seed-series'||value.startsWith('demo:'));
const liveRecording=(r:Recording)=>r.mode==='live'&&!r.events?.some(e=>e.id.startsWith('demo-'));
export function migrateLiveOnly(input:BroadcastState,defaults:BroadcastState):BroadcastState {
  const s=structuredClone(input),wasDemo=String(s.mode)==='demo';
  const removedResultIds=new Set((s.gameResults??[]).filter(r=>!liveRecording(r.snapshot)).map(r=>r.id));
  s.mode='live';
  s.recordings=(s.recordings??[]).filter(liveRecording);
  s.gameResults=(s.gameResults??[]).filter(r=>liveRecording(r.snapshot));
  s.draftHistory=(s.draftHistory??[]).filter(h=>String(h.source)!=='demo'&&!legacySeries(h.seriesId));
  if(s.draftHistoryPending&&(String(s.draftHistoryPending.source)==='demo'||legacySeries(s.draftHistoryPending.seriesId)))delete s.draftHistoryPending;
  // Remove only the original, unchanged schedule rows and team profiles.
  const originalRows=[
    ['m1','半决赛 A','azure','ember','2026-10-03T19:00:00+08:00','BO3','live',1,0],
    ['m2','半决赛 B','jade','storm','2026-10-03T20:30:00+08:00','BO3','scheduled',0,0],
    ['m3','决赛','azure','jade','2026-10-04T19:00:00+08:00','BO5','scheduled',0,0],
  ];
  s.schedule=(s.schedule??[]).filter(m=>!originalRows.some(row=>JSON.stringify(row)===JSON.stringify([m.id,m.title,m.blueTeamId,m.redTeamId,m.scheduledAt,m.format,m.status,m.blueScore,m.redScore])));
  const needed=new Set(s.schedule.flatMap(m=>[m.blueTeamId,m.redTeamId]));
  for(const r of s.gameResults) {needed.add(r.blueTeamId);needed.add(r.redTeamId);}
  // A configured live event may already use one of these profiles.
  if(!wasDemo&&!legacySeries(s.match.seriesId)){needed.add(s.match.blueTeamId);needed.add(s.match.redTeamId);}
  s.teams=s.teams.filter(t=>!untouchedTeam(t)||needed.has(t.id));
  for(const side of ['blue','red'] as const)if(!s.teams.some(t=>t.id===s.match[`${side}TeamId`])){
    let replacement=s.teams.find(t=>t.id===side);
    if(!replacement){replacement=structuredClone(defaults.teams.find(t=>t.id===side)!);s.teams.push(replacement);}
    s.match[`${side}TeamId`]=replacement.id;
  }
  if(s.match.title==='峡谷邀请赛 · 秋季赛')s.match.title='';
  if(s.match.subtitle==='半决赛 · 演示数据')s.match.subtitle='';
  if(s.overlay.tickerText==='峡谷邀请赛 · 欢迎来到比赛直播间')s.overlay.tickerText='';
  if(s.overlay.bottomTitle==='2026 DEMACIA CUP GLOBAL INVITATIONAL')s.overlay.bottomTitle='';
  if(wasDemo){
    for(const key of ['players','stats','events','economy','draft','gameTime','paused','phase','selectedPlayerId'] as const)
      Object.assign(s,{[key]:structuredClone(defaults[key])});
    for(const key of ['economyFeed','ocrMatch','gameClock','activeSourceGameId','finishedGameId','reportGameId','awaitingNextGame','draftHistoryPending','nativeHudStatus'] as const)delete s[key];
    s.previewScene='standby';s.programScene='standby';
    if(legacySeries(s.match.seriesId)){s.match.seriesId=defaults.match.seriesId;s.match.game=1;s.match.blueScore=0;s.match.redScore=0;}
  }
  if(s.production){
    const p=s.production;
    const demoProgram=p.program&&String(p.program.mode)==='demo';
    if(wasDemo||demoProgram){
      delete p.program;delete p.programDraftHold;delete p.programRosterHold;
      delete p.clientDraft;p.draftUndo=[];p.assignments=[];p.draftMode='auto';
    }
    if(wasDemo||String(p.previousProgram?.content.mode)==='demo')delete p.previousProgram;
    p.invalidAttempts=(p.invalidAttempts??[]).filter(a=>!a.key.includes('"demo"')&&(!a.result||liveRecording(a.result.snapshot)));
    p.corrections=(p.corrections??[]).filter(c=>!removedResultIds.has(c.resultId));
    p.marks=p.marks?.filter(item=>!item.key.includes('"demo"'))??[];
    p.objectives=p.objectives?.filter(item=>!item.key.includes('"demo"'))??[];
    p.clips=p.clips?.filter(item=>!item.key.includes('"demo"'))??[];
    p.videos=p.videos?.filter(item=>!legacySeries(item.seriesId))??[];
    p.audit=p.audit?.filter(item=>!['demo-pause','demo-reset'].includes(item.type))??[];
    if(wasDemo){p.scores={};p.baseScores={};p.attempt=1;p.entry='bp';p.checks={};delete p.pause;delete p.analysisEndsAt;delete p.playingClipId;delete p.application;}
  }
  if(s.finishedGameId&&!s.gameResults.some(r=>r.id===s.finishedGameId))delete s.finishedGameId;
  if(s.reportGameId&&!s.gameResults.some(r=>r.id===s.reportGameId))delete s.reportGameId;
  return s;
}
