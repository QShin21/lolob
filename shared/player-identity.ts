import type { BroadcastState, Side } from './types';

/** Only a full Riot ID is eligible for account matching; display names are never identity evidence. */
export function parseRiotId(input: unknown): { gameName:string; tagLine:string; display:string; key:string } | null {
  if (typeof input !== 'string' || input.length > 150 || /[\u0000-\u001f\u007f]/.test(input)) return null;
  const parts=input.trim().normalize('NFC').split('#');if(parts.length!==2)return null;
  const gameName=parts[0].trim(),tagLine=parts[1].trim();
  if(!gameName||gameName.length>80||!tagLine||tagLine.length>16||/\s/.test(tagLine))return null;
  const display=`${gameName}#${tagLine}`;return {gameName,tagLine,display,key:display.toLowerCase()};
}
export function clientRiotId(input: {riotId?:unknown;riotIdGameName?:unknown;riotIdTagLine?:unknown}):ReturnType<typeof parseRiotId> {
  const full=parseRiotId(input.riotId),parts=typeof input.riotIdGameName==='string'&&typeof input.riotIdTagLine==='string'?parseRiotId(`${input.riotIdGameName}#${input.riotIdTagLine}`):null;
  return full&&parts&&full.key!==parts.key?null:parts??full;
}
export interface AutomaticSidesResult { status:'disabled'|'unknown'|'aligned'|'swap'; blueTeamId:string; redTeamId:string; matches:{blue:number;red:number}; reason:string }
export function resolveAutomaticSides(state:BroadcastState,rawPlayers:unknown):AutomaticSidesResult {
  const result:AutomaticSidesResult={status:'unknown',blueTeamId:state.match.blueTeamId,redTeamId:state.match.redTeamId,matches:{blue:0,red:0},reason:'等待双方各至少三个唯一账号匹配'};
  if(!state.production?.autoSides)return {...result,status:'disabled',reason:'自动阵营识别已关闭'};
  if(!Array.isArray(rawPlayers)||rawPlayers.length!==10)return {...result,reason:'需要完整十人名单'};
  const teams=[state.teams.find(t=>t.id===state.match.blueTeamId),state.teams.find(t=>t.id===state.match.redTeamId)];
  if(teams.some(t=>!t)||teams[0]!.id===teams[1]!.id)return {...result,reason:'请先配置两支不同队伍'};
  const accounts=new Map<string,number>();
  for(const [i,team]of teams.entries())for(const p of team!.players){const id=parseRiotId(p.account);if(!id)continue;if(accounts.has(id.key))return {...result,reason:'配置名单中存在重复账号，无法自动识别'};accounts.set(id.key,i);}
  const observed=new Set<string>(),counts=[{blue:0,red:0},{blue:0,red:0}],sideCounts={blue:0,red:0};
  for(const p of rawPlayers){
    if(!p||typeof p!=='object'||Array.isArray(p))return {...result,reason:'客户端名单格式不完整'};
    const side:Side|null=p.team==='ORDER'||p.team==='blue'? 'blue':p.team==='CHAOS'||p.team==='red'?'red':null;
    if(!side)return {...result,reason:'客户端阵营未确认'};sideCounts[side]++;
    const full=parseRiotId(p.riotId),parts=typeof p.riotIdGameName==='string'&&typeof p.riotIdTagLine==='string'?parseRiotId(`${p.riotIdGameName}#${p.riotIdTagLine}`):null;
    if(full&&parts&&full.key!==parts.key)return {...result,reason:'客户端账号字段存在冲突'};
    const id=parts??full;if(!id)continue;
    if(observed.has(id.key))return {...result,reason:'客户端账号重复，无法自动识别'};observed.add(id.key);
    const index=accounts.get(id.key);if(index!==undefined)counts[index][side]++;
  }
  if(sideCounts.blue!==5||sideCounts.red!==5)return {...result,reason:'双方人数需各为五人'};
  if(counts.some(c=>c.blue>0&&c.red>0))return {...result,reason:'同队账号分布在两侧，保持当前配置'};
  const aligned=counts[0].blue>=3&&counts[1].red>=3,swapped=counts[0].red>=3&&counts[1].blue>=3;
  if(!aligned&&!swapped)return result;
  return {...result,status:swapped?'swap':'aligned',blueTeamId:teams[swapped?1:0]!.id,redTeamId:teams[swapped?0:1]!.id,matches:{blue:counts[swapped?1:0].blue,red:counts[swapped?0:1].red},reason:swapped?'双方账号一致匹配，已修正待播阵营':'双方账号与当前阵营一致'};
}
