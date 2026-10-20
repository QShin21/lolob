import { defaultObjectiveRegions } from '../../shared/hud-ocr';
import { currentGameResult } from '../../shared/game-results';
import { OcrCalibration } from './OcrCalibration';
import { useEffect, useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import type { EconomyFeed, EconomyOcrConfig, StateContext } from '../../shared/types';
import { api, gold } from '../lib';

const initial:EconomyOcrConfig={enabled:false,blue:{x:.33,y:0,width:.08,height:.06},red:{x:.59,y:0,width:.08,height:.06}};
const playerRegion={x:0,y:.4,width:1,height:.6};
const labels={none:'等待经济来源',memory:'国服观战直读',api:'游戏 API',manual:'历史人工校准',ocr:'历史 HUD 读数'};
export function EconomySourcePanel({state,notify}:Pick<StateContext,'state'|'notify'>){
 const [config,setConfig]=useState<EconomyOcrConfig>(state.settings.economyOcr||initial),[busy,setBusy]=useState(false);
 const configKey=JSON.stringify(state.settings.economyOcr);
 useEffect(()=>setConfig(state.settings.economyOcr||initial),[configKey]);
 const frozen=!!currentGameResult(state),feed=frozen?undefined:state.economyFeed;
 const objectives=config.objectives??{enabled:config.enabled,regions:defaultObjectiveRegions};
 const players=config.players??{enabled:false,region:playerRegion};
 async function run(route:string,body:unknown){setBusy(true);try{const result=await api<EconomyFeed>(route,{method:'POST',body:JSON.stringify(body)});notify(result.detail);}catch(e){notify(e instanceof Error?e.message:'采集操作失败','error');}finally{setBusy(false);}}
 return <section className="panel economy-bridge"><div className="panel-head"><div><h2>经济数据来源</h2><p className="muted">直接读取十名选手的当前金币与累计金币，团队经济由同一批次五名选手的累计金币相加。</p></div><span className="badge">LIVE</span></div>
  <div className={`economy-source-status ${feed?.status||''}`}><strong>{labels[feed?.source||'none']}</strong><span>{frozen?'赛后已冻结':feed?.status==='fresh'?'读数有效':feed?.status==='stale'?'等待新样本':'待采集'}</span><p>{frozen?'本局经济与曲线已保存在赛后记录。测试其他录像请开启新系列赛；正式赛事请进入下一局或载入下一场。':feed?.detail||'连接国服观战或回放后自动采集。'}</p></div>
  <div className="economy-readings"><span className="blue-text">蓝方累计金币<b>{gold(state.stats.blue.gold)}</b></span><span className="red-text">红方累计金币<b>{gold(state.stats.red.gold)}</b></span></div>
  <p>经济曲线按游戏时间记录，每 5 秒保留最新样本；个人经济、团队合计和曲线使用同一数据来源。暂停时停留在当前游戏时间，采样中断保留空白。</p>
  <p role="status">{feed?.players?.detail||'等待个人金币数据'}{feed?.sampledAt?` · 采样时间 ${new Date(feed.sampledAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'})}`:''}</p>
  <details><summary>辅助 HUD 识别：视野、计分板统计与顶部资源</summary>
   <p>以下 OCR 仅补充视野、KDA、补刀与顶部资源计数，金币始终使用直接采集数据。</p>
   <label className="toggle-setting"><span>读取个人计分板统计</span><input type="checkbox" checked={players.enabled} onChange={e=>setConfig({...config,players:{...players,enabled:e.target.checked}})}/></label>
   <label className="toggle-setting"><span>读取顶部四类资源</span><input type="checkbox" checked={objectives.enabled} onChange={e=>setConfig({...config,objectives:{...objectives,enabled:e.target.checked}})}/></label>
   <p>{feed?.objectives?.detail}</p>
   <OcrCalibration config={config} onChange={setConfig} goldRegions={false}/>
   <div className="inline-buttons"><button className="button small" disabled={busy||frozen} onClick={()=>void run('/api/economy/config',{...config,enabled:false,players,objectives})}><Save size={14}/>保存辅助识别设置</button><button className="button small" disabled={busy||frozen||(!players.enabled&&!objectives.enabled)} onClick={()=>void run('/api/economy/probe',{delayMs:3000})}><RefreshCw size={14}/>3 秒后读取辅助数据</button></div>
  </details>
 </section>;
}
