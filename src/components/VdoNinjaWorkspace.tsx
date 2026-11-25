import { useEffect, useState } from 'react';
import { api } from '../lib';
import { vdoRoles, type VdoStatus } from '../../shared/vdo-ninja';
import { Copy } from 'lucide-react';
import './task-panels.css';
import './vdo-ninja.css';

export function vdoOverlayUrl(side: 'blue' | 'red', slot: number) {
  const url = new URL('/overlay/vdo', location.origin); url.searchParams.set('side', side); url.searchParams.set('slot', String(slot));
  const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('riftcast-control-token'); if (token) url.searchParams.set('token', token);
  return url.href;
}
export function VdoNinjaWorkspace() {
  const [data, setData] = useState<VdoStatus>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [copied, setCopied] = useState('');
  useEffect(() => { let live = true; const poll = () => api<VdoStatus>('/api/vdo-ninja').then(v => { if (live) { setData(v); setError(''); } }).catch(e => { if (live) setError(e.message); }); void poll(); const timer = setInterval(poll, 3000); return () => { live = false; clearInterval(timer); }; }, []);
  async function update(body: unknown) { setBusy(true); try { setData(await api<VdoStatus>('/api/vdo-ninja', { method: 'POST', body: JSON.stringify(body) })); setError(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setCopied('链接已复制'); } catch { setCopied('复制失败，可选中文本框复制'); } }
  const hasInvitations = !!data?.invitations.length;
  return <section className="vdo-workspace panel tpanel">
    <div className="tpanel-heading"><h2 className="tpanel-title">VDO.Ninja 远程选手画面</h2><p className="tpanel-note">为当前两队名单生成邀请链接，选手打开链接选择摄像机。将本机分路来源添加到 BP 或局内自定义构图，名单确认及换边后自动跟随。输出仅接收视频。</p></div>
    <div className="vdo-actions"><button className={`button ${hasInvitations ? '' : 'primary'}`} disabled={busy} onClick={() => void update({ op: 'generate' })}>生成 / 补齐当前名单链接</button><button className="button" disabled={busy || !hasInvitations} onClick={() => void update({ op: 'clear' })}>清除本机绑定</button><label className="tpanel-toggle tpanel-toggle-closed"><span>启用远程选手画面</span><input type="checkbox" aria-label="启用远程选手画面" checked={data?.enabled ?? false} disabled={busy || !hasInvitations} onChange={e => void update({ op: 'enabled', enabled: e.target.checked })}/></label></div>
    {error && <p className="gl-callout" data-tone="error" role="alert">{error}</p>}<p className="vdo-copied tpanel-hint" role="status">{copied}</p>{data?.warnings.map(w => <p className="gl-callout" data-tone="warn" key={w}>{w}</p>)}
    <section className="vdo-list"><h3 className="tpanel-subtitle">选手邀请链接</h3>
      <div className="vdo-invitations">{data?.invitations.map(row => <article key={`${row.teamId}:${row.playerId}`}><h3>{row.teamName} · {row.playerName} <small>{row.role}</small></h3><input className="tpanel-mono" aria-label={`${row.playerName}邀请链接`} readOnly value={row.inviteUrl} onFocus={e => e.target.select()}/><div><button className="button small" onClick={() => void copy(row.inviteUrl)}><Copy size={14} aria-hidden="true"/>复制选手邀请</button><button className="button small ghost" disabled={busy} onClick={() => void update({ op: 'rotate', teamId: row.teamId, playerId: row.playerId })}>重新生成此链接</button></div></article>)}</div>
      {!hasInvitations && <div className="tpanel-empty"><strong>尚未生成邀请链接</strong><p>点击上方「生成 / 补齐当前名单链接」，为两队名单各生成一条邀请。</p></div>}
    </section>
    <section className="vdo-list"><h3 className="tpanel-subtitle">自动跟随名单的浏览器来源</h3>
      <div className="vdo-feed-links">{(['blue','red'] as const).flatMap(side => vdoRoles.map((role, slot) => { const feed = data?.feeds.find(f => f.side === side && f.slot === slot), url = vdoOverlayUrl(side, slot); return <article key={`${side}${slot}`}><strong><span className={side === 'blue' ? 'blue-text' : 'red-text'}>{side === 'blue' ? '蓝方' : '红方'}</span> · {role} · {feed?.name || '待确认'}</strong><small>{feed?.reason || '已绑定；收到选手视频后由 VDO.Ninja 显示'}</small><input className="tpanel-mono" aria-label={`${side}${slot}来源链接`} value={url} readOnly onFocus={e => e.target.select()}/><button className="button small" onClick={() => void copy(url)}><Copy size={14} aria-hidden="true"/>复制来源</button></article>; }))}</div>
    </section>
    <p className="tpanel-hint vdo-footnote">邀请链接由你分发；本页生成和复制链接时不会连接选手。启用后的来源页面会连接 VDO.Ninja，真实视频和网络连通性请在赛前核对。重新生成会替换后续使用的链接；已建立的第三方连接由发送端关闭。</p>
  </section>;
}
export function VdoNinjaOutput() {
  const params = new URLSearchParams(location.search), side = params.get('side') === 'red' ? 'red' : 'blue', slot = Number(params.get('slot') ?? '0');
  const [data, setData] = useState<Pick<VdoStatus, 'enabled' | 'feeds'>>();
  useEffect(() => { let live = true; const poll = () => api<Pick<VdoStatus,'enabled'|'feeds'>>('/api/vdo-ninja/feeds').then(v => { if (live) setData(v); }).catch(() => { if (live) setData(undefined); }); void poll(); const timer = setInterval(poll, 1000); return () => { live = false; clearInterval(timer); }; }, []);
  const feed = data?.feeds.find(f => f.side === side && f.slot === slot);
  return <div className="vdo-output">{data?.enabled && feed?.viewUrl ? <iframe key={feed.viewUrl} src={feed.viewUrl} title={`${feed.name}远程选手视频`} allow="autoplay; fullscreen" referrerPolicy="no-referrer"/> : <div className="vdo-output-empty">{feed?.reason || '等待远程选手画面配置'}</div>}</div>;
}
