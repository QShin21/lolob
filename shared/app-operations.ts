import type { BroadcastState } from './types';

export interface DesktopUpdateStatus {
  phase: 'idle'|'checking'|'available'|'current'|'downloading'|'verifying'|'ready'|'cancelled'|'error';
  currentVersion: string; received: number; total: number; detail: string; path?: string;
  release?: {version:string;name:string;size:number;sha256:string;publishedAt:string};
}
export type DesktopUpdateAction = 'status'|'check'|'download'|'cancel'|'show-file';
/** Deliberate allowlist: no names, account IDs, paths, connection details, logs, tokens or configuration values. */
export function localDiagnosticReport(state:BroadcastState,version:string,now=Date.now()):string {
  const statuses=['connected','connecting','disconnected','error'];
  const connections=Object.fromEntries(['lcu','live','replay','obs'].map(key=>[key,statuses.includes(state.connections[key as keyof typeof state.connections]?.status)?state.connections[key as keyof typeof state.connections]?.status:'unknown']));
  const scene=(value:string)=>['draft','lineup','live','analysis','teamfight','postgame','schedule','countdown','interview','break','player'].includes(value)?value:'custom';
  return JSON.stringify({schema:'riftcast-local-diagnostic-v1',createdAt:new Date(now).toISOString(),version:/^\d+\.\d+\.\d+$/.test(version)?version:'unknown',
    phase:['idle','draft','loading','live','postgame'].includes(state.phase)?state.phase:'unknown',revision:Number.isSafeInteger(state.revision)?state.revision:null,
    connections,preview:scene(state.previewScene),program:scene(state.programScene),counts:{teams:state.teams.length,players:state.players.length,events:state.events.length,archives:state.gameResults?.length??0},
    coverage:{playerStats:state.players.filter(p=>p.statsAvailable===true).length,playerDamage:state.players.filter(p=>typeof p.telemetryDamage?.toChampions==='number').length},
    browser:{online:typeof navigator==='undefined'?null:navigator.onLine},scope:'仅包含版本、连接状态、阶段与数据数量；由用户自行保存或发送'},null,2);
}
