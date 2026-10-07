import { useRef, useState } from 'react';
import { Archive, ArrowRight, CheckCircle2, FileText, Trophy } from 'lucide-react';
import type { BroadcastAction, StateContext } from '../../shared/types';
import { currentGameResult, gameResultAwaitingTerminalSample } from '../../shared/game-results';
import { getTeam } from '../lib';
import './match-lifecycle.css';

export function MatchLifecycle({ state, send, notify, onNextGame, onRecords, onReport }: Pick<StateContext, 'state' | 'send' | 'notify'> & {
  onNextGame: () => void; onRecords: () => void; onReport: () => void;
}) {
  const result = currentGameResult(state);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const [reason,setReason]=useState('');
  if (!result) return null;
  const winner = result.winner ? getTeam({ ...state, match: result.match, teams: result.teams }, result.winner) : undefined;
  const waitingForSample=gameResultAwaitingTerminalSample(result);
  async function act(action: BroadcastAction, message: string, after?: () => void) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError('');
    try { await send(action); notify(message); after?.(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '操作未完成，请检查工作站连接'); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <section className="match-lifecycle" aria-label="本局结束与下一局">
    <div className="match-lifecycle-status"><CheckCircle2 size={17} /><span><strong>第 {result.game} 局{result.source==='manual'?'已保存':'已自动保存'}</strong><small>{waitingForSample?'本局观测数据已保存 · 等待终局样本':'选手数据与赛后报告已冻结'} · {winner ? `${winner.tag} 获胜` : '胜方待确认'}{result.seriesComplete ? ' · 本场系列赛已结束' : ` · ${result.match.format} ${result.match.blueScore}:${result.match.redScore}`}</small></span></div>
    <div className="match-lifecycle-actions">
      {!result.winner && <><button className="button small" disabled={pending} onClick={() => void act({ type: 'finalize-game', winner: 'blue' }, '已确认蓝色方获胜并更新系列赛比分')}>确认 {getTeam({...state,match:result.match,teams:result.teams},'blue')?.name??'蓝方'} 获胜</button><button className="button small" disabled={pending} onClick={() => void act({ type: 'finalize-game', winner: 'red' }, '已确认红色方获胜并更新系列赛比分')}>确认 {getTeam({...state,match:result.match,teams:result.teams},'red')?.name??'红方'} 获胜</button></>}
      <button className="button small" disabled={pending} onClick={() => void act({ type: 'preview-scene', scene: 'postgame' }, `第 ${result.game} 局赛后报告已设为预监`, onReport)}><FileText size={13} />赛后报告</button>
      <button className="button small" disabled={pending} onClick={onRecords}><Archive size={13} />比赛记录</button>
      <button className="button small" disabled={pending} onClick={()=>void act({type:'preview-scene',scene:'interview'},'采访已设为待播')}>准备采访</button>
      <button className="button primary small" disabled={pending || waitingForSample || !result.winner || result.seriesComplete} title={result.seriesComplete ? '本场系列赛已结束，请从赛事准备载入下一场比赛' : !result.winner ? '请先确认本局胜方，系列赛比分更新后即可进入下一局' : '保留本场战队与系列赛比分，进入下一局 BP 准备'} onClick={() => void act({ type: 'next-game' }, `已进入第 ${result.game + 1} 局准备，上局记录已保留`, onNextGame)}>{result.seriesComplete ? <Trophy size={13} /> : <ArrowRight size={13} />}{pending ? '正在处理…' : result.seriesComplete ? '系列赛已结束' : `下一局 · GAME ${result.game + 1}`}</button>
    </div>
    {(waitingForSample||!result.winner||result.seriesComplete)&&<p className="muted">{result.seriesComplete?'系列赛已结束，请停止本场输出后准备下一场':!result.winner?'进入下一局前请确认本局胜方':'进入下一局前请完成终局采样或采用现有记录'}</p>}
    {error && <p className="match-lifecycle-error" role="alert">{error}</p>}
    {waitingForSample&&<div><input aria-label="采用现有终局记录的理由" placeholder="终局接口不可用时，填写裁判确认理由" value={reason} onChange={e=>setReason(e.target.value)}/><button className="button small" disabled={pending||!reason.trim()} onClick={()=>void act({type:'production',command:{op:'accept-final',reason}},'已确认采用现有记录，缺失字段继续保留')}>凭理由采用现有记录</button></div>}
    {!waitingForSample&&result.terminalSampleComplete===false&&<p className="muted">终局数据仍含缺失或末次观察值，导出保留原采样时间。</p>}
  </section>;
}
