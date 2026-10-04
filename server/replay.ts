import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export type LocalApiErrorKind='http'|'refused'|'timeout'|'invalid-json'|'oversize'|'unavailable';
export class LocalApiError extends Error {
  constructor(message:string,readonly kind:LocalApiErrorKind,readonly port:number,readonly endpoint:string,readonly statusCode?:number){super(message);this.name='LocalApiError';}
}
export type LocalRequest=(port:number,endpoint:string,options?:{authorization?:string;method?:string;body?:unknown})=>Promise<any>;
export interface ReplayConfig {path:string;enabled:boolean|null;modifiedAt:string}
export interface GameProcess {executablePath:string;startedAt?:string}
export interface ReplayDiagnostics {
  status:'ready'|'disabled'|'restart-required'|'not-running'|'unavailable'|'unsupported'|'invalid-response';
  detail:string;lastProbeAt:string;configPath?:string;configEnabled?:boolean|null;restartRequired:boolean;
  endpoints:{path:string;available:boolean;statusCode?:number;errorKind?:LocalApiErrorKind}[];
  declaredReplayPaths:string[];playback?:{paused:boolean;time:number;speed:number;length?:number};
}
const runFile=promisify(execFile);
const object=(v:unknown):Record<string,any>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:null;

export function replayEnabled(config:string):boolean|null {
  let section='';const values:string[]=[];
  for(const line of config.replace(/^\uFEFF/,'').split(/\r\n|\n|\r/)){const header=line.match(/^\s*\[([^\]]+)\]\s*(?:[;#].*)?$/);if(header){section=header[1].trim().toLowerCase();continue;}if(section==='general'){const entry=line.match(/^\s*EnableReplayApi\s*=\s*([^;#]*)/i);if(entry)values.push(entry[1].trim());}}
  if(!values.length)return false;return values.every(v=>v==='1')?true:values.every(v=>v==='0')?false:null;
}
export async function currentGameProcess():Promise<GameProcess|undefined>{
  if(process.platform!=='win32')return undefined;
  try{
    const {stdout}=await runFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter "Name='League of Legends.exe'" | Select-Object ExecutablePath,@{Name='StartedAt';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}} | ConvertTo-Json -Compress`],{windowsHide:true,timeout:5000,maxBuffer:1024*1024});
    const data=JSON.parse(stdout||'null');const first=Array.isArray(data)?data.find(p=>typeof p?.ExecutablePath==='string'):data;
    if(typeof first?.ExecutablePath==='string')return {executablePath:first.ExecutablePath,...(typeof first.StartedAt==='string'?{startedAt:first.StartedAt}:{})};
  }catch{/* Process inspection never includes command lines or credentials. */}
  return undefined;
}
export async function findReplayConfig(gamePath:string,gameProcess?:GameProcess):Promise<ReplayConfig|undefined>{
  const directories=[...(gameProcess?[path.dirname(gameProcess.executablePath)]:[]),...(gamePath?[gamePath]:[])];
  const candidates=[...new Set(directories.flatMap(directory=>[path.join(directory,'Config','game.cfg'),path.join(directory,'Game','Config','game.cfg'),...(['game','leagueclient'].includes(path.basename(directory).toLowerCase())?[path.join(path.dirname(directory),'Game','Config','game.cfg'),path.join(path.dirname(directory),'Config','game.cfg')]:[])]))];
  for(const file of candidates)try{const [buffer,info]=await Promise.all([readFile(file),stat(file)]);let source:string;if(buffer[0]===0xff&&buffer[1]===0xfe)source=buffer.subarray(2).toString('utf16le');else if(buffer[0]===0xfe&&buffer[1]===0xff)source=Buffer.from(buffer.subarray(2)).swap16().toString('utf16le');else source=buffer.toString('utf8');return {path:file,enabled:replayEnabled(source),modifiedAt:info.mtime.toISOString()};}catch{/* Try only the configured installation or the running game's installation. */}
  return undefined;
}
export function validPlayback(value:unknown):value is NonNullable<ReplayDiagnostics['playback']>{const data=object(value);return !!data&&typeof data.paused==='boolean'&&typeof data.time==='number'&&Number.isFinite(data.time)&&data.time>=0&&typeof data.speed==='number'&&Number.isFinite(data.speed)&&data.speed>=0;}

export async function diagnoseReplay(request:LocalRequest,gamePath:string,context?:{config?:ReplayConfig;gameProcess?:GameProcess;skipDiscovery?:boolean}):Promise<ReplayDiagnostics>{
  const contextPromise=(async()=>{const gameProcess=context?.gameProcess??(context?.skipDiscovery?undefined:await currentGameProcess());return {gameProcess,config:context?.config??await findReplayConfig(gamePath,gameProcess)};})();
  const paths=['/replay/playback','/swagger/v3/openapi.json','/swagger/v2/swagger.json'];
  const responses=await Promise.allSettled(paths.map(endpoint=>request(2999,endpoint)));
  const {gameProcess,config}=await contextPromise;
  const endpoints=responses.map((result,i)=>({path:paths[i],available:result.status==='fulfilled',...(result.status==='rejected'&&result.reason instanceof LocalApiError?{statusCode:result.reason.statusCode,errorKind:result.reason.kind}:{})}));
  const declared=new Set<string>();for(const response of responses.slice(1))if(response.status==='fulfilled'){const spec=object(response.value);for(const endpoint of Object.keys(object(spec?.paths)??{}))if(endpoint.startsWith('/replay/'))declared.add(endpoint);}
  const base={lastProbeAt:new Date().toISOString(),...(config?{configPath:config.path,configEnabled:config.enabled}:{}),restartRequired:false,endpoints,declaredReplayPaths:[...declared]};
  const playback=responses[0];
  if(playback.status==='fulfilled')return validPlayback(playback.value)?{...base,status:'ready',detail:'Replay API 已连接 · 播放状态读取成功，控制仅用于回放',playback:{paused:playback.value.paused,time:playback.value.time,speed:playback.value.speed,...(typeof playback.value.length==='number'&&Number.isFinite(playback.value.length)?{length:playback.value.length}:{})}}:{...base,status:'invalid-response',detail:'Replay API 返回了不兼容的播放状态，无法确认暂停、倍速与时间字段；请检查客户端版本。'};
  const error=playback.reason;
  if(error instanceof LocalApiError){
    if(error.kind==='refused')return {...base,status:'not-running',detail:'本机 2999 游戏接口未启动。请先打开录像回放；启用 Replay API 后需要重新打开回放。'};
    if(error.kind==='timeout')return {...base,status:'unavailable',detail:'本机 Replay API 连接超时。请等待回放加载完成后重试，必要时重新打开回放。'};
    if(error.kind==='http'&&error.statusCode===404){
      const location=config?.path??'实际安装目录中的 Config/game.cfg';
      if(config?.enabled===false)return {...base,status:'disabled',restartRequired:true,detail:`Replay API 返回 HTTP 404；${location} 的 [General] 节尚未启用 EnableReplayApi=1。启用后重新打开回放，再点击连接。`};
      if(config?.enabled===true&&gameProcess?.startedAt&&Date.parse(gameProcess.startedAt)<Date.parse(config.modifiedAt))return {...base,status:'restart-required',restartRequired:true,detail:`Replay API 返回 HTTP 404；${location} 已启用，但当前游戏进程启动早于配置修改。请重新打开回放后连接。`};
      if(declared.has('/replay/playback'))return {...base,status:'unsupported',restartRequired:true,detail:'当前客户端在 Swagger 中声明了 Replay API，但播放接口返回 HTTP 404。请重新打开回放；若仍失败，需要核对该客户端版本的回放支持。'};
      return {...base,status:'unsupported',restartRequired:true,detail:config?.enabled===true?`Replay API 返回 HTTP 404；${location} 已启用，当前进程尚未暴露回放接口。请重新打开回放；若仍返回 404，该版本可能未提供 Replay API。`:`Replay API 返回 HTTP 404；当前客户端未暴露回放接口。请在 ${location} 的 [General] 节启用 EnableReplayApi=1 并重新打开回放。`};
    }
  }
  return {...base,status:'unavailable',detail:error instanceof Error?`Replay API 暂不可用：${error.message}`:'Replay API 暂不可用，请重新打开回放后重试。'};
}
