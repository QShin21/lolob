import { useEffect, useState } from 'react';
import { integrationEvents, type IntegrationStatus } from '../../shared/integrations';
import { api } from '../lib';
import './integration-workspace.css';

const eventNames = { 'game.event': '游戏事件', 'game.changed': '新一局', 'phase.changed': '比赛阶段', 'program.changed': '节目切换', 'result.saved': '赛果归档' };
type Draft = Omit<IntegrationStatus,'webhooks'> & { webhooks: (IntegrationStatus['webhooks'][number] & {secret?:string})[] };
export function IntegrationWorkspace({disabled=false}:{disabled?:boolean}) {
  const [status,setStatus]=useState<IntegrationStatus>(),[draft,setDraft]=useState<Draft>(),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const refresh=async()=>{const s=await api<IntegrationStatus>('/api/integrations');setStatus(s);setDraft(structuredClone(s));};
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
  async function run(work:()=>Promise<void>,success?:string){if(busy)return;setBusy(true);setError('');setMessage('');try{await work();if(success)setMessage(success);}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy(false);}}
  if(!draft)return <section className="integration-workspace"><p role="status">{error||'正在载入集成设置…'}</p></section>;
  const patchHook=(index:number,patch:Partial<Draft['webhooks'][number]>)=>setDraft({...draft,webhooks:draft.webhooks.map((h,i)=>i===index?{...h,...patch}:h)});
  return <div className="integration-workspace">
    <section className="settings-block"><header><h2>实时数据接口</h2><p>JSON 与事件流读取已播节目的比赛数据，供自定义浏览器图层及制作工具使用。事件流最多每秒更新 4 次。</p></header>
      <div className="integration-actions"><button className="button" disabled={disabled||busy} onClick={()=>void run(async()=>{const value=await api<{token:string}>('/api/integrations',{method:'POST',body:JSON.stringify({action:'rotate-key'})});setKey(value.token);await refresh();},'新密钥已生成；旧密钥与旧订阅连接已失效')}>{status?.hasKey?'更换数据接口密钥':'生成数据接口密钥'}</button><span>{status?.hasKey?'已启用密钥访问':'等待生成密钥'}</span></div>
      {key&&<label className="field">本次生成的密钥<input readOnly value={key} onFocus={e=>e.target.select()}/><small>此处仅显示本次生成值，请保存到使用数据的工具中。</small></label>}
      <label className="field">允许读取数据的网页来源（每行一个）<textarea rows={3} placeholder="https://graphics.example.com" value={(draft.allowedOrigins??[]).join("\n")} onChange={e=>setDraft({...draft,allowedOrigins:e.target.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)})}/><small>填写协议、主机和端口；本机同源图层无需填写。</small></label><div className="integration-code"><code>GET {location.origin}/api/integrations/data</code><code>Authorization: Bearer &lt;接口密钥&gt;</code><code>EventSource: /api/integrations/stream?key=&lt;接口密钥&gt;</code></div>
    </section>
    <section className="settings-block"><header><h2>制作 Webhook</h2><p>新事件通过 HTTPS 发送，使用 HMAC-SHA256 签名；失败最多尝试 3 次。回放跳转会重新建立事件基线。</p></header>
      {draft.webhooks.map((h,i)=><fieldset className="integration-hook" key={h.id} disabled={disabled||busy}><legend>{h.name||`Webhook ${i+1}`}</legend><div className="settings-fields settings-two-column">
        <label className="field">名称<input value={h.name} onChange={e=>patchHook(i,{name:e.target.value})}/></label><label className="field">接收地址<input placeholder="https://example.com/hooks/riftcast" value={h.url} onChange={e=>patchHook(i,{url:e.target.value})}/></label>
        <label className="field">签名密钥<input type="password" autoComplete="new-password" placeholder="至少 16 字符；留空保留已存密钥" value={h.secret??''} onChange={e=>patchHook(i,{secret:e.target.value})}/></label><label className="integration-check"><input type="checkbox" checked={h.enabled} onChange={e=>patchHook(i,{enabled:e.target.checked})}/>启用发送</label>
      </div><div className="integration-events">{integrationEvents.map(event=><label key={event}><input type="checkbox" checked={h.events.includes(event)} onChange={e=>patchHook(i,{events:e.target.checked?[...h.events,event]:h.events.filter(v=>v!==event)})}/>{eventNames[event]}</label>)}</div>
      <button className="button" onClick={()=>setDraft({...draft,webhooks:draft.webhooks.filter((_,j)=>j!==i)})}>移除此接收端</button></fieldset>)}
      <button className="button" disabled={disabled||busy||draft.webhooks.length>=12} onClick={()=>setDraft({...draft,webhooks:[...draft.webhooks,{id:crypto.randomUUID(),name:'制作接收端',url:'',enabled:false,events:[...integrationEvents]}]})}>添加 Webhook</button>
      <details><summary>签名校验方法</summary><p>将 X-RiftCast-Timestamp、英文句点与原始请求正文连接，用签名密钥计算 HMAC-SHA256；结果对应 X-RiftCast-Signature 中的 sha256 值。接收端按 X-RiftCast-Delivery 去重并检查时间戳。</p></details>
    </section>
    <div className="integration-actions"><button className="button primary" disabled={disabled||busy} onClick={()=>void run(async()=>{const saved=await api<IntegrationStatus>('/api/integrations',{method:'POST',body:JSON.stringify(draft)});setStatus(saved);setDraft(saved);},'集成设置已保存')}>{busy?'处理中…':'保存集成设置'}</button><button className="button" disabled={busy} onClick={()=>void run(refresh)}>刷新发送记录</button></div>
    {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="integration-error">{error}</p>}
    {!!status?.deliveries.length&&<section className="settings-block"><h3>最近发送记录</h3><div className="integration-table"><table><thead><tr><th>接收端</th><th>事件</th><th>状态</th><th>次数</th><th>回执</th></tr></thead><tbody>{status.deliveries.map((d,i)=><tr key={`${d.id}:${i}`}><td>{d.name}</td><td>{d.event}</td><td>{{queued:'待发送',sent:'已送达',failed:'失败'}[d.status]}</td><td>{d.attempts}</td><td>{d.detail||'—'}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
