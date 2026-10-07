import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastState, Champion, ControlSeat, Notice, NoticeKind } from '../shared/types';
import { api, dispatch } from './lib';
import { takeBlockReason } from '../shared/presentation';
export function useBroadcast() {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Notice | null>(null);
  const [seat,setSeat]=useState<ControlSeat>();
  const noticeId=useRef(0);
  const dismissNotice=useCallback(()=>setToast(null),[]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest=useRef<BroadcastState|null>(state);latest.current=state;
  const seatReady=useRef<Promise<unknown>>(Promise.resolve());
  const seatStarted=useRef(false);
  const notify = useCallback((message: string, kind: NoticeKind = 'info') => {
    const notice={id:++noticeId.current,message,kind}; setToast(notice);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if(kind==='success'||kind==='info')toastTimer.current=setTimeout(()=>setToast(current=>current?.id===notice.id?null:current),5500);
  }, []);
  const applied=useRef<string | undefined>(undefined);
  useEffect(()=>{const app=state?.production?.application;if(!app)return;const key=`${app.id}:${app.status}:${app.at}`;if(applied.current&&applied.current!==key){if(app.status==='failed')notify(app.detail||'OBS 应用失败，请检查连接后重试','error');else if(app.status==='applied')notify('OBS 已应用节目，请核对画面与声音','success');}applied.current=key;},[state?.production?.application,notify]);
  useEffect(() => {
    let stopped = false; let socket: WebSocket | null = null; let retry: ReturnType<typeof setTimeout>; let attempt = 0;
    const accept = (next: BroadcastState) => setState(previous => !previous || next.revision >= previous.revision ? next : previous);
    api<BroadcastState>('/api/state').then(accept).catch(e => setError(e.message));
    const invitation=new URLSearchParams(location.search).get('seat');if(invitation)sessionStorage.setItem('riftcast-seat-token',invitation);
    if(!location.pathname.startsWith('/overlay')&&!seatStarted.current){seatStarted.current=true;seatReady.current=api<{token:string;id:string;name:string;role:ControlSeat['role'];owner:boolean}>('/api/control/seat',{method:'POST',body:JSON.stringify({name:location.pathname.startsWith('/remote')?'移动资料席':'主机导播',role:location.pathname.startsWith('/remote')?'data':'director'})}).then(seat=>{sessionStorage.setItem('riftcast-seat-token',seat.token);setSeat({id:seat.id,name:seat.name,role:seat.role});sessionStorage.setItem('riftcast-seat-info',JSON.stringify({id:seat.id,name:seat.name,role:seat.role}));if(!seat.owner)notify(seat.role==='readonly'?'当前为只读席，可核对节目与预监':'当前席位可准备内容，节目切入由主导播控制席执行');}).catch(e=>{seatStarted.current=false;notify(e.message,'error');});}
    api<{ champions: Champion[] }>('/api/champions').then(data => setChampions(data.champions)).catch(e => notify(`英雄素材暂不可用：${e.message}`,'warning'));
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
    try { await seatReady.current; if(action.type==='take'&&latest.current){const reason=takeBlockReason(latest.current,seat,connected);if(reason)throw new Error(reason);} const next = await dispatch({...action,expectedConfigVersion:action.expectedConfigVersion??latest.current?.production?.configVersion,requestId:crypto.randomUUID()});latest.current=next; setState(previous => !previous || next.revision >= previous.revision ? next : previous); if((action.type==='take'||action.type==='production'&&action.command.op==='immediate')&&next.production?.application?.status==='failed')throw new Error(next.production.application.detail); if(action.type==='take')notify(next.production?.application?.status==='applied'?'OBS 已应用节目，请核对画面与声音':'切入请求已接收，等待 OBS 应用',next.production?.application?.status==='applied'?'success':'info'); }
    catch (e) { void api<BroadcastState>('/api/state').then(next=>{latest.current=next;setState(next);}).catch(()=>{});notify(e instanceof Error ? e.message : '操作失败','error'); throw e; }
  }, [notify,seat,connected]);
  return { state, champions, connected, error, toast, notify, send, seat, dismissNotice };
}
