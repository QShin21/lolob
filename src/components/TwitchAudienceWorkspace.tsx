import { useEffect, useState } from 'react';
import { initialTwitchAudienceState, type TwitchAudienceDisplay, type TwitchAudienceQuestion, type TwitchAudienceState } from '../../shared/twitch-audience';
import { api } from '../lib';
import './twitch-audience.css';

function useTwitchAudience() {
  const [state, setState] = useState<TwitchAudienceState>(initialTwitchAudienceState), [error, setError] = useState('');
  useEffect(() => {
    let disposed = false, busy = false;
    const load = async () => { if (busy) return; busy = true; try { const value = await api<TwitchAudienceState>('/api/twitch-audience'); if (!disposed) { setState(value); setError(''); } } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : '读取观众互动失败'); } finally { busy = false; } };
    void load(); const timer = window.setInterval(() => void load(), 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);
  return { state, setState, error, setError };
}
const displays: Record<TwitchAudienceDisplay, string> = { hidden: '隐藏', poll: 'Twitch 投票', prediction: 'Twitch 预测', 'chat-vote': '聊天投票' };

export function TwitchAudienceWorkspace() {
  const { state, setState, error, setError } = useTwitchAudience();
  const [clientId, setClientId] = useState(''), [accessToken, setAccessToken] = useState(''), [broadcasterId, setBroadcasterId] = useState('');
  const [title, setTitle] = useState('本局 MVP 是谁？'), [options, setOptions] = useState('蓝方选手\n红方选手'), [seconds, setSeconds] = useState(60), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  async function action(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { setState(await api<TwitchAudienceState>('/api/twitch-audience', { method: 'POST', body: JSON.stringify(body) })); if (body.op === 'connect') setAccessToken(''); }
    catch (e) { setError(e instanceof Error ? e.message : '互动操作失败'); }
    finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(new URL('/overlay/twitch', location.origin).href); setNotice('观众互动浏览器源已复制'); } catch { setNotice('可打开浏览器源后复制地址'); } }
  return <section className="twitch-audience-workspace" aria-label="Twitch 观众互动">
    <header><div><h2>Twitch 观众互动</h2><p>{state.channel ? `${state.channel.login} · ` : ''}{state.detail}</p></div><div className="twitch-audience-actions"><button className="button" onClick={() => void copy()}>复制浏览器源</button><a className="button" href="/overlay/twitch" target="_blank" rel="noreferrer">打开观众图形</a></div></header>
    {error && <p role="alert" className="twitch-audience-error">{error}</p>}{notice && <p role="status">{notice}</p>}{state.warnings.map((warning, i) => <p className="twitch-audience-note" key={i}>{warning}</p>)}
    <details open={state.status === 'disconnected' || state.status === 'error'}><summary>频道授权与连接</summary><form onSubmit={e => { e.preventDefault(); void action({ op: 'connect', clientId, accessToken, broadcasterId }); }}>
      <div className="twitch-audience-fields"><label>应用 Client ID<input required autoComplete="off" value={clientId} onChange={e => setClientId(e.target.value)} /></label><label>主播用户 Access Token<input required type="password" autoComplete="off" value={accessToken} onChange={e => setAccessToken(e.target.value)} /></label><label>频道用户 ID（可留空自动识别）<input autoComplete="off" value={broadcasterId} onChange={e => setBroadcasterId(e.target.value)} inputMode="numeric" /></label></div>
      <p className="twitch-audience-note">读取投票需要 channel:read:polls；预测需要 channel:read:predictions；聊天投票需要 user:read:chat。令牌在本次运行中驻留内存，重启后重新连接。<a href="https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/" target="_blank" rel="noreferrer">查看 Twitch 官方授权说明</a></p>
      <div className="twitch-audience-actions"><button className="button primary" disabled={busy} type="submit">连接频道</button><button className="button" disabled={busy || state.status === 'disconnected'} type="button" onClick={() => void action({ op: 'disconnect' })}>断开并清除令牌</button><button className="button" disabled={busy || state.status !== 'connected'} type="button" onClick={() => void action({ op: 'refresh' })}>刷新平台结果</button></div>
    </form></details>
    <section><h3>观众画面</h3><div className="twitch-audience-actions">{Object.entries(displays).map(([id, label]) => <button key={id} className="button" aria-pressed={state.display === id} disabled={busy} onClick={() => void action({ op: 'display', display: id })}>{label}</button>)}</div><p className="twitch-audience-note">Twitch 投票和预测由频道后台管理，RiftCast 接收结果并生成图形。聊天投票接收观众发送的序号或完整选项，每名观众计一票。</p></section>
    <form className="twitch-chat-vote-form" onSubmit={e => { e.preventDefault(); void action({ op: 'start-vote', title, options: options.split(/\r?\n/).map(v => v.trim()).filter(Boolean), durationSeconds: seconds }); }}><h3>聊天投票</h3><div className="twitch-audience-fields"><label>投票题目<input required maxLength={140} value={title} onChange={e => setTitle(e.target.value)} /></label><label>选项（每行一项，2—8 项）<textarea required rows={3} value={options} onChange={e => setOptions(e.target.value)} /></label><label>持续秒数<input type="number" min={10} max={3600} value={seconds} onChange={e => setSeconds(Number(e.target.value))} /></label></div><div className="twitch-audience-actions"><button className="button primary" disabled={busy || state.status !== 'connected' || !state.capabilities.chat} type="submit">开始收集聊天投票</button><button className="button" disabled={busy || state.chatVote?.status !== 'ACTIVE'} type="button" onClick={() => void action({ op: 'end-vote' })}>结束收集</button></div></form>
    <div className="twitch-audience-preview"><TwitchAudienceGraphic state={state} /></div>
  </section>;
}

export function TwitchAudienceGraphic({ state }: { state: TwitchAudienceState }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const question: TwitchAudienceQuestion | undefined = state.display === 'poll' ? state.poll : state.display === 'prediction' ? state.prediction : state.display === 'chat-vote' ? state.chatVote : undefined;
  if (state.display === 'hidden' || !question) return null;
  const total = question.choices.reduce((n, c) => n + c.votes, 0);
  const active = question.status === 'ACTIVE', remaining = question.endsAt ? Math.max(0, Math.ceil((Date.parse(question.endsAt) - now) / 1000)) : null;
  return <article className="twitch-audience-graphic"><header><span>TWITCH · {displays[state.display]}</span><b>{active && remaining !== null ? `${remaining}s` : question.status === 'LOCKED' ? '已锁定' : active ? '进行中' : '已结束'}</b></header><h2>{question.title}</h2><div className="twitch-audience-options">{question.choices.map((c, index) => <div key={c.id || index} className="twitch-audience-option" data-winner={question.winningChoiceId === c.id}><div className="twitch-audience-bar" style={{ width: `${total ? c.votes / total * 100 : 0}%` }} /><strong>{state.display === 'chat-vote' ? `${index + 1}. ` : ''}{c.title}</strong><span>{total ? (c.votes / total * 100).toFixed(1) : '0.0'}% · {c.votes.toLocaleString()}{state.display === 'prediction' ? ' 人' : ' 票'}</span></div>)}</div><footer>{state.display === 'chat-vote' ? '在聊天中发送选项序号 · 每位观众一票' : state.display === 'prediction' ? '按参与人数统计 · Twitch 频道预测' : 'Twitch 频道投票'}{state.status !== 'connected' ? ' · 连接中断，显示已收到的结果' : ''}</footer></article>;
}

export function TwitchAudienceOverlay() {
  const { state, error } = useTwitchAudience();
  return <div className="twitch-audience-overlay">{!error && <TwitchAudienceGraphic state={state} />}</div>;
}
