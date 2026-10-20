import { currentGameResult } from '../../shared/game-results';
import { objectiveCount, objectiveKeys, objectiveLabels } from '../../shared/objective-counts';
import type { StateContext } from '../../shared/types';
import { gold } from '../lib';
const labels={none:'等待经济来源',memory:'国服观战直读',api:'游戏 API',manual:'历史人工校准',ocr:'历史 HUD 读数'};
export function EconomySourcePanel({state}:Pick<StateContext,'state'|'notify'>){
 const frozen=!!currentGameResult(state),feed=frozen?undefined:state.economyFeed;
 return <section className="panel economy-bridge"><div className="panel-head"><div><h2>经济数据来源</h2><p className="muted">直接读取十名选手的当前金币与累计金币，团队经济由同一批次五名选手的累计金币相加。</p></div><span className="badge">LIVE</span></div>
  <div className={`economy-source-status ${feed?.status||''}`}><strong>{labels[feed?.source||'none']}</strong><span>{frozen?'赛后已冻结':feed?.status==='fresh'?'读数有效':feed?.status==='stale'?'等待新样本':'待采集'}</span><p>{frozen?'本局经济与曲线已保存在赛后记录。测试其他录像请开启新系列赛；正式赛事请进入下一局或载入下一场。':feed?.detail||'连接国服观战或回放后自动采集。'}</p></div>
  <div className="economy-readings"><span className="blue-text">蓝方累计金币<b>{gold(state.stats.blue.gold)}</b></span><span className="red-text">红方累计金币<b>{gold(state.stats.red.gold)}</b></span></div>
  <p>经济曲线按游戏时间记录，每 5 秒保留最新样本；个人经济、团队合计和曲线使用同一数据来源。暂停时停留在当前游戏时间，采样中断保留空白。</p>
  <p role="status">{feed?.players?.detail||'等待个人金币数据'}{feed?.sampledAt?` · 采样时间 ${new Date(feed.sampledAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})}`:''}</p>
  <h3>国服直接采集</h3>
  <p>视野得分、KDA、精确补刀和资源计数直接取自观战数据，连接后自动更新。</p>
  <table><thead><tr><th>资源</th><th>蓝方</th><th>红方</th></tr></thead><tbody>{objectiveKeys.map(key=><tr key={key}><th>{objectiveLabels[key]}</th>{(['blue','red']as const).map(side=><td key={side}>{objectiveCount(state,side,key)??'—'}</td>)}</tr>)}</tbody></table>
  <p>{feed?.objectives?.detail}</p>
 </section>;
}
