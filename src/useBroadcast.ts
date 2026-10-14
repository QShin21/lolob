import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastState, Champion, ControlSeat, Notice, NoticeKind } from '../shared/types';
import { api, dispatch } from './lib';
import { takeBlockReason } from '../shared/presentation';

export type SeatStatus = 'checking' | 'verified' | 'invalid';
export type SeatRecoveryAction = { kind: 'retry' | 'local' } | { kind: 'invite'; url: string };
type VerifiedSeat = ControlSeat & { owner: boolean; token?: string };

export function useBroadcast() {
  const [state, setState] = useState<BroadcastState | null>(null);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Notice | null>(null);
  const [seat, setSeat] = useState<ControlSeat>();
  // Display identity keeps the existing task mounted; it never grants permission.
  const [lastSeat, setLastSeat] = useState<ControlSeat>();
  const [seatStatus, setSeatStatus] = useState<SeatStatus>('checking');
  const [seatError, setSeatError] = useState('');
  const verifiedSeat = useRef<ControlSeat | undefined>(undefined);
  const transportOpen = useRef(false);
  const verification = useRef(0);
  const issueRequest = useRef<Promise<VerifiedSeat> | undefined>(undefined);
  const recover = useRef<(action: SeatRecoveryAction) => Promise<void>>(async () => {});
  const noticeId = useRef(0);
  const dismissNotice = useCallback(() => setToast(null), []);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<BroadcastState | null>(null);
  const accept = useCallback((next: BroadcastState, reset = false) => {
    if (reset || !latest.current || next.revision >= latest.current.revision) {
      latest.current = next;
      setState(next);
    }
  }, []);
  const invalidateSeat = useCallback((detail = '') => {
    verification.current++;
    verifiedSeat.current = undefined;
    setSeat(undefined);
    setSeatStatus(detail ? 'invalid' : 'checking');
    setSeatError(detail);
  }, []);
  const notify = useCallback((message: string, kind: NoticeKind = 'info') => {
    const notice = { id: ++noticeId.current, message, kind };
    setToast(notice);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (kind === 'success' || kind === 'info') toastTimer.current = setTimeout(() => setToast(current => current?.id === notice.id ? null : current), 5500);
  }, []);
  const applied = useRef<string | undefined>(undefined);
  useEffect(() => {
    const app = state?.production?.application;
    if (!app) return;
    const key = `${app.id}:${app.status}:${app.at}`;
    if (applied.current && applied.current !== key) {
      if (app.status === 'failed') notify(app.detail || 'OBS 应用失败，请检查连接后重试', 'error');
      else if (app.status === 'applied') notify('OBS 已应用节目，请核对画面与声音', 'success');
    }
    applied.current = key;
  }, [state?.production?.application, notify]);

  useEffect(() => {
    let stopped = false, socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined, attempt = 0;
    const output = location.pathname.startsWith('/overlay');
    const remote = location.pathname.startsWith('/remote');
    const query = new URLSearchParams(location.search);
    if (query.get('seat')) sessionStorage.setItem('riftcast-seat-token', query.get('seat')!);
    if (query.get('token')) sessionStorage.setItem('riftcast-control-token', query.get('token')!);
    api<BroadcastState>('/api/state').then(next => { if (!stopped) accept(next); }).catch(e => { if (!stopped) setError(e.message); });
    api<{ champions: Champion[] }>('/api/champions').then(data => { if (!stopped) setChampions(data.champions); }).catch(e => { if (!stopped) notify(`英雄素材暂不可用：${e.message}`, 'warning'); });

    const verify = async (action: SeatRecoveryAction = { kind: 'retry' }) => {
      invalidateSeat();
      const generation = verification.current;
      const current = () => !stopped && generation === verification.current;
      try {
        let token = sessionStorage.getItem('riftcast-seat-token');
        let control = sessionStorage.getItem('riftcast-control-token');
        if (action.kind === 'invite') {
          const invitation = new URL(action.url.trim());
          if (invitation.origin !== location.origin || !invitation.searchParams.get('seat')) throw new Error('请粘贴当前导播工作站发出的完整席位邀请链接');
          token = invitation.searchParams.get('seat');
          control = invitation.searchParams.get('token') || control;
        }
        let result: VerifiedSeat;
        const headers = { 'X-Seat-Token': token || '', 'X-Control-Token': control || '' };
        if (action.kind === 'local') {
          if (remote || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) throw new Error('请由主机导播重新发出席位邀请');
          result = await api<VerifiedSeat>('/api/control/seat', { method: 'POST', headers, body: JSON.stringify({ name: '主机导播', role: 'director', fresh: true }) });
        } else if (token) {
          // Resume is read-only: an expired invitation must not turn into a new role.
          result = await api<VerifiedSeat>('/api/control/seat', { headers });
        } else {
          if (!issueRequest.current) issueRequest.current = api<VerifiedSeat>('/api/control/seat', {
            method: 'POST', body: JSON.stringify({ name: remote ? '移动资料席' : '主机导播', role: remote ? 'data' : 'director' }),
          }).catch(e => { issueRequest.current = undefined; throw e; });
          result = await issueRequest.current;
        }
        // Also refresh the controller established by initial issuance before enabling tasks.
        const next = await api<BroadcastState>('/api/state', { headers });
        if (!current()) return;
        token = result.token || token;
        if (!token) throw new Error('操作席位尚未验证');
        sessionStorage.setItem('riftcast-seat-token', token);
        if (control) sessionStorage.setItem('riftcast-control-token', control);
        if (action.kind === 'invite') {
          const url = new URL(location.href);
          url.searchParams.delete('seat'); url.searchParams.delete('token');
          history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
        const identity = { id: result.id, name: result.name, role: result.role };
        sessionStorage.setItem('riftcast-seat-info', JSON.stringify(identity));
        accept(next);
        verifiedSeat.current = identity;
        setSeat(identity); setLastSeat(identity); setSeatStatus('verified'); setSeatError('');
        // A fresh invitation can also replace an expired LAN pairing token.
        if (action.kind === 'invite' && socket?.readyState !== WebSocket.OPEN) {
          clearTimeout(retry); socket?.close(); connect();
        }
      } catch (e) {
        if (!current()) return;
        const detail = e instanceof Error ? e.message : '操作席位验证失败';
        invalidateSeat(detail);
        throw e;
      }
    };
    recover.current = verify;
    const connect = () => {
      if (stopped) return;
      const token = sessionStorage.getItem('riftcast-control-token');
      const active = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      socket = active;
      let firstMessage = true;
      active.onopen = () => {
        if (stopped || socket !== active) return;
        transportOpen.current = true; setConnected(true); setError(''); attempt = 0;
        if (!output) void verify().catch(() => {});
      };
      active.onmessage = e => {
        if (stopped || socket !== active) return;
        try { accept(JSON.parse(e.data) as BroadcastState, firstMessage); firstMessage = false; }
        catch { setError('同步数据格式异常'); }
      };
      active.onclose = () => {
        if (stopped || socket !== active) return;
        transportOpen.current = false; setConnected(false); invalidateSeat();
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
      active.onerror = () => { if (!stopped && socket === active) setError('本地服务连接中断，正在重连'); };
    };
    connect();
    return () => {
      stopped = true; verification.current++; verifiedSeat.current = undefined; transportOpen.current = false;
      clearTimeout(retry); socket?.close(); if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [accept, invalidateSeat, notify]);

  const recoverSeat = useCallback((action: SeatRecoveryAction) => recover.current(action), []);
  const send = useCallback(async (action: Parameters<typeof dispatch>[0]) => {
    const generation = verification.current;
    try {
      if (!transportOpen.current) throw new Error('同步中断，等待重新连接');
      if (!verifiedSeat.current) throw new Error('操作席位尚未验证，请先恢复席位');
      if (action.type === 'take' && latest.current) {
        const reason = takeBlockReason(latest.current, verifiedSeat.current, transportOpen.current);
        if (reason) throw new Error(reason);
      }
      // A caller may retain a transaction after losing its receipt. The exact
      // request ID AND version must survive retries for the server dedupe check.
      const next = await dispatch({ ...action, expectedConfigVersion: action.expectedConfigVersion ?? latest.current?.production?.configVersion, requestId: action.requestId ?? crypto.randomUUID() });
      if (generation !== verification.current) throw new Error('提交期间连接已变化，请核对当前待播与节目回执后再操作');
      accept(next);
      if ((action.type === 'take' || action.type === 'production' && action.command.op === 'immediate') && next.production?.application?.status === 'failed') throw new Error(next.production.application.detail);
      if (action.type === 'take') notify(next.production?.application?.status === 'applied' ? 'OBS 已应用节目，请核对画面与声音' : '切入请求已接收，等待 OBS 应用', next.production?.application?.status === 'applied' ? 'success' : 'info');
    } catch (e) {
      const message = e instanceof Error ? e.message : '操作失败';
      if (/重新连接操作席位|连接已授权的操作席位/.test(message)) invalidateSeat(message);
      if (generation === verification.current) void api<BroadcastState>('/api/state').then(next => { if (generation === verification.current) accept(next); }).catch(() => {});
      notify(message, 'error'); throw e;
    }
  }, [accept, invalidateSeat, notify]);
  return { state, champions, connected, error, toast, notify, send, seat: connected ? seat : undefined, lastSeat, seatStatus, seatError, recoverSeat, dismissNotice };
}
