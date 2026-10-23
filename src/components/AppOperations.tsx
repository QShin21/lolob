import { useEffect, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import type { BroadcastState } from '../../shared/types';
import type { DesktopUpdateAction, DesktopUpdateStatus } from '../../shared/app-operations';
import { localDiagnosticReport } from '../../shared/app-operations';
import { version } from '../../package.json';
import './app-operations.css';

type Panel='report'|'update'|'guide';
const tutorialKey='riftcast-first-device-guide-v1';
export function openAppOperation(panel:Panel){window.dispatchEvent(new CustomEvent('riftcast:app-operation',{detail:panel}));}
const steps=[
  {title:'连接比赛与画面',body:'在“输出 → 数据连接”确认游戏客户端与回放状态，再到画面、声音和输出页检查游戏来源及监听。'},
  {title:'准备战队与本局名单',body:'在“赛事”保存双方队伍和选手账号，载入比赛；在“BP 阵容”确认身份、分路和规则。正式名单保存后进入待播。'},
  {title:'核对预监后切入节目',body:'导播台左侧 PGM 显示当前节目，右侧 PVW 显示待播预监。核对预监后按 TAKE 切入节目；技术暂停和撤回切换入口保持可用。'},
  {title:'赛前演练与赛后归档',body:'使用“输出 → 图形演示”检查模拟画面和缺失数据。赛后在“收尾”确认结果、归档与下一局；“帮助”可重新打开本引导、检查更新或保存故障报告。'},
];
export function AppOperations({state}:{state:BroadcastState}){
  const [panel,setPanel]=useState<Panel|null>(null),[guidePrompt,setGuidePrompt]=useState(false),[step,setStep]=useState(0),[report,setReport]=useState(''),[message,setMessage]=useState(''),[update,setUpdate]=useState<DesktopUpdateStatus>(),[busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{try{setGuidePrompt(localStorage.getItem(tutorialKey)!=='done');}catch{setGuidePrompt(true);}const listener=(event:Event)=>{const next=(event as CustomEvent).detail;if(['report','update','guide'].includes(next)){setPanel(next);setStep(0);setMessage('');}};window.addEventListener('riftcast:app-operation',listener);return()=>window.removeEventListener('riftcast:app-operation',listener);},[]);
  useEffect(()=>{if(panel){dialog.current?.showModal();if(panel==='report')setReport(localDiagnosticReport(state,version));}else dialog.current?.close();},[panel]);
  useEffect(()=>{if(panel!=='update'||!window.riftcastDesktop?.update)return;let live=true;const poll=()=>window.riftcastDesktop!.update('status').then(s=>{if(live)setUpdate(s);}).catch(e=>{if(live)setMessage(e.message);});void poll();const timer=setInterval(poll,500);return()=>{live=false;clearInterval(timer);};},[panel]);
  function finish(){try{localStorage.setItem(tutorialKey,'done');}catch{/* This device can retry on next launch. */}setGuidePrompt(false);setPanel(null);}
  async function command(action:DesktopUpdateAction){setBusy(true);setMessage('');try{setUpdate(await window.riftcastDesktop!.update(action));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  function saveReport(){const url=URL.createObjectURL(new Blob([report],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`RiftCast-diagnostic-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('已保存本机报告，请核对内容后自行发送');}
  const running=update&&['checking','downloading','verifying'].includes(update.phase);
  return <>
    {guidePrompt&&<aside className="first-device-guide" aria-label="首次设备引导"><button className="first-guide-open" onClick={()=>openAppOperation('guide')}><BookOpen size={16}/><span>开始引导</span></button><button className="first-guide-dismiss" aria-label="跳过引导" title="跳过引导" onClick={finish}><X size={16}/></button></aside>}
    <dialog className="app-operation-dialog" ref={dialog} onCancel={()=>setPanel(null)} onClose={()=>setPanel(null)} aria-label={panel==='report'?'本机故障报告':panel==='update'?'应用版本与下载':'首次设备引导'}>
      <header><h2>{panel==='report'?'本机故障报告':panel==='update'?'应用版本与下载':'首次设备引导'}</h2><button className="button" onClick={()=>setPanel(null)}>关闭</button></header>
      {panel==='report'&&<><p>报告只包含版本、连接状态、当前阶段和数据数量，排除账号、选手姓名、路径、日志、令牌与推流配置。先查看内容，再保存或复制给维护人员。</p><textarea aria-label="脱敏故障报告内容" readOnly value={report}/><div className="app-operation-actions"><button className="button primary" onClick={saveReport}>保存报告到本机</button><button className="button" onClick={()=>void navigator.clipboard.writeText(report).then(()=>setMessage('已复制，可核对后自行发送'),()=>setMessage('复制失败，请选择内容或保存到本机'))}>复制报告</button><button className="button" onClick={()=>setReport(localDiagnosticReport(state,version))}>重新生成</button></div></>}
      {panel==='guide'&&<><p>第 {step+1} / {steps.length} 步</p><h3>{steps[step].title}</h3><p>{steps[step].body}</p><div className="app-operation-actions"><button className="button" disabled={!step} onClick={()=>setStep(i=>i-1)}>上一步</button>{step<steps.length-1?<button className="button primary" onClick={()=>setStep(i=>i+1)}>下一步</button>:<button className="button primary" onClick={finish}>完成引导</button>}<button className="button" onClick={finish}>跳过引导</button></div></>}
      {panel==='update'&&<><p>当前版本 {update?.currentVersion||version} · 正式发布：QShin21/lolob</p>{window.riftcastDesktop?.update?<><div className="app-operation-actions"><button className="button" disabled={busy||!!running} onClick={()=>void command('check')}>检查新版本</button>{update?.release&&update.phase!=='current'&&<button className="button primary" disabled={busy||!!running||update.phase==='ready'} onClick={()=>void command('download')}>{update.phase==='error'||update.phase==='cancelled'?'重试下载':'下载安装包'}</button>}{running&&<button className="button" disabled={busy} onClick={()=>void command('cancel')}>取消操作</button>}{update?.phase==='ready'&&<button className="button" onClick={()=>void command('show-file')}>在下载目录中显示</button>}</div>{update&&<div className="app-update-status" role="status"><strong>{update.detail}</strong>{update.release&&<span>{update.release.name} · {(update.total/1024/1024).toFixed(2)} MB</span>}{['downloading','verifying','ready'].includes(update.phase)&&<><progress value={update.received} max={Math.max(1,update.total)}/><span>{(update.received/1024/1024).toFixed(2)} / {(update.total/1024/1024).toFixed(2)} MB</span></>}{update.path&&<code>{update.path}</code>}</div>}<p>安装包保存在系统“下载”目录，完整性通过大小和 SHA-256 校验后确认。同名不同内容文件会保留。下载完成后，请在停播时自行运行安装器。</p></>:<p>请在 RiftCast 桌面窗口中检查与下载更新。</p>}</>}
      {message&&<p role="status">{message}</p>}
    </dialog>
  </>;
}
