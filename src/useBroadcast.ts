import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastState, Champion } from '../shared/types';
import { api, dispatch } from './lib';
export function useBroadcast() {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest=useRef<BroadcastState|null>(state);latest.current=state;
  const seatReady=useRef<Promise<unknown>>(Promise.resolve());
  const seatStarted=useRef(false);
  const notify = useCallback((message: string) => { setToast(message); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3800); }, []);
  useEffect(() => {
    let stopped = false; let socket: WebSocket | null = null; let retry: ReturnType<typeof setTimeout>; let attempt = 0;
    const accept = (next: BroadcastState) => setState(previous => !previous || next.revision >= previous.revision ? next : previous);
    api<BroadcastState>('/api/state').then(accept).catch(e => setError(e.message));
    const invitation=new URLSearchParams(location.search).get('seat');if(invitation)sessionStorage.setItem('riftcast-seat-token',invitation);
    if(!location.pathname.startsWith('/overlay')&&!seatStarted.current){seatStarted.current=true;seatReady.current=api<{token:string;id:string;name:string;role:string;owner:boolean}>('/api/control/seat',{method:'POST',body:JSON.stringify({name:location.pathname.startsWith('/remote')?'移动资料席':'主机导播'})}).then(seat=>{sessionStorage.setItem('riftcast-seat-token',seat.token);sessionStorage.setItem('riftcast-seat-info',JSON.stringify({name:seat.name,role:seat.role}));if(!seat.owner)notify('当前席位可准备内容，节目切入需主导播接管');}).catch(e=>{seatStarted.current=false;notify(e.message);});}
    api<{ champions: Champion[] }>('/api/champions').then(data => setChampions(data.champions)).catch(e => notify(`英雄素材暂不可用：${e.message}`));
    const connect = () => {
      if (stopped) return;
      const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('riftcast-control-token');
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      socket.onopen = () => { if (stopped) return; setConnected(true); setError(''); attempt = 0; };
      let firstMessage = true;
      socket.onmessage = e => { try { const next = JSON.parse(e.data) as BroadcastState; if (firstMessage) { setState(next); firstMessage = false; } else accept(next); } catch { setError('同步数据格式异常'); } };
      socket.onclose = () => { if (stopped) return; setConnected(false); retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000)); };
      socket.onerror = () => { if (!stopped) setError('本地服务连接中断，正在重连'); };
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [notify]);
  const send = useCallback(async (action: Parameters<typeof dispatch>[0]) => {
    try { await seatReady.current; const next = await dispatch({...action,expectedConfigVersion:action.expectedConfigVersion??latest.current?.production?.configVersion,requestId:crypto.randomUUID()});latest.current=next; setState(previous => !previous || next.revision >= previous.revision ? next : previous); if((action.type==='take'||action.type==='production'&&action.command.op==='immediate')&&next.production?.application?.status==='failed')throw new Error(next.production.application.detail); }
    catch (e) { void api<BroadcastState>('/api/state').then(next=>{latest.current=next;setState(next);});notify(e instanceof Error ? e.message : '操作失败'); throw e; }
  }, [notify]);
  return { state, champions, connected, error, toast, notify, send };
}
