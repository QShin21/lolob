import { useState } from 'react';
import type { SeatRecoveryAction, SeatStatus } from '../useBroadcast';

export type SeatRecoveryProps = {
  status: SeatStatus;
  detail: string;
  recover: (action: SeatRecoveryAction) => Promise<void>;
};

export function SeatRecovery({ status, detail, recover }: SeatRecoveryProps) {
  const [invitation, setInvitation] = useState(''), [busy, setBusy] = useState(false);
  const local = !location.pathname.startsWith('/remote') && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const run = async (action: SeatRecoveryAction) => {
    if (busy) return;
    setBusy(true);
    try { await recover(action); setInvitation(''); } catch { /* detail remains beside recovery controls */ }
    finally { setBusy(false); }
  };
  if (status === 'verified') return null;
  return <section className="seat-recovery" aria-label="恢复操作席位">
    <div role={status === 'invalid' ? 'alert' : 'status'}>
      <strong>{status === 'invalid' ? '操作席位需要重新验证' : '正在验证操作席位'}</strong>
      <span>{detail || '连接恢复后正在核对授权身份。'} 本地草稿保留，验证通过前暂停提交。</span>
    </div>
    <div className="seat-recovery-actions">
      <button className="button" disabled={busy} onClick={() => void run({ kind: 'retry' })}>重新验证席位</button>
      {local ? <button className="button" disabled={busy} onClick={() => void run({ kind: 'local' })}>重新连接主机导播席</button> : <>
        <label>新席位邀请链接<input type="text" value={invitation} onChange={e => setInvitation(e.target.value)} placeholder="粘贴主机导播重新发出的完整邀请" autoComplete="off"/></label>
        <button className="button" disabled={busy || !invitation.trim()} onClick={() => void run({ kind: 'invite', url: invitation })}>使用新邀请恢复</button>
      </>}
    </div>
  </section>;
}
