import type { Recording } from './types';

export function csvRecording(r:Recording):string {
  const quote=(value:unknown)=>{let t=String(value??'');if(/^[=+@\-\t\r]/.test(t))t=`'${t}`;return `"${t.replaceAll('"','""')}"`;};
  const sources={none:'不可用',api:'游戏 API',manual:'人工校准',ocr:'观战 HUD 识别'};
  const source=sources[r.economyFeed?.source??'none'];
  const players=r.players.map(p=>{
    const available=p.statsAvailable!==false;
    return [p.team,p.name,p.role,p.championName,
      available?p.kills:'不可用',available?p.deaths:'不可用',available?p.assists:'不可用',available?p.cs:'不可用',available?p.level:'不可用',
      p.gold??'不可用',p.goldSource==='api'?'游戏 API':p.goldSource==='memory'?'只读遥测':p.goldSource==='ocr'?'观战 HUD 识别':'不可用',p.goldSampledAt??'',p.currentGold??'不可用',
      !available?'不可用':p.statsSource==='api'?'游戏 API':p.statsSource==='ocr'?'观战 HUD 识别':'未记录',p.statsSampledAt??'',p.goldGameTime??'',p.statsGameTime??''];
  });
  const rows:unknown[][]=[['数据来源','真实'],['实际采样时间',r.observedAt??'未记录'],['实际游戏秒数',r.sourceGameTime??r.duration],['队伍','选手','位置','英雄','击杀','死亡','助攻','补刀','等级','个人累计经济','个人经济来源','个人经济采样时间','当前金币','KDA / 补刀来源','KDA / 补刀采样时间','个人经济对应游戏秒数','KDA / 补刀对应游戏秒数'],...players,[],['团队','团队累计经济','经济来源'],['blue',r.stats.blue.gold??'不可用',source],['red',r.stats.red.gold??'不可用',source],[],['比赛秒数','蓝方经济','红方经济','采样来源'],...r.economy.map(p=>[p.time,p.blue,p.red,sources[p.source??'none']])];
  if(r.result)rows.unshift(['结果 ID',r.result.resultId],['系列赛 ID',r.result.seriesId],['局号',r.result.game],['重赛尝试',r.result.attempt],['胜方',r.result.winner??'待确认'],['胜方战队 ID',r.result.winnerTeamId??''],['结果修订版本',r.result.version],['有效结果',r.result.valid===false?'已作废':'有效'],['作废理由',r.result.invalidReason??''],['终局数据完整',r.result.terminalComplete?'是':'含缺失'],['系列赛结束',r.result.seriesComplete?'是':'否'],['系列赛蓝方比分',r.result.blueScore],['系列赛红方比分',r.result.redScore],[]);
  rows.push([],['伤害统计（仅数据存档）'],['队伍','选手','英雄','对英雄伤害','承受伤害','对英雄物理伤害','对英雄魔法伤害','对英雄真实伤害','数据来源']);
  for(const p of r.players)rows.push([p.team,p.name,p.championName,...(['toChampions','taken','physicalToChampions','magicToChampions','trueToChampions'] as const).map(key=>p.telemetryDamage?.[key]??'不可用'),p.telemetryDamageSource==='postgame'?'官方赛后统计':p.telemetryDamageSource==='packets'?`逐次伤害（游戏 ${Math.floor(p.telemetryDamageSince??0)} 秒起采集）`:p.telemetryDamageSource==='memory'?'只读遥测':p.telemetryDamageSource==='api'?'游戏 API':'不可用']);
  return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');
}
