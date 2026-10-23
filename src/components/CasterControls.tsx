import { useState } from 'react';
import type { StateContext } from '../../shared/types';
import { productionDefaults } from '../../shared/production';
import { casterActionLabels, casterBaseActions, casterScenes, validateCasterConfiguration, type CasterButton, type HotkeyAliases } from '../../shared/caster-controls';
import { analysisModes, analysisLabels } from '../../shared/broadcast-analysis';
import { globalShortcutLabels } from '../../shared/global-shortcuts';
import { executeCasterAction } from './caster-action';
import { sceneInfo } from '../lib';
import './caster-controls.css';

type Props = Pick<StateContext,'state'|'seat'|'connected'|'send'|'notify'>;
const splitKeys = (text: string) => text.trim() ? text.split(/[,，;；\n]/).map(k=>k.trim()) : [];
export function CasterControls(ctx: Props) {
  const {state,seat,connected,send,notify}=ctx, p=state.production??productionDefaults();
  const [draft,setDraft]=useState<{buttons:CasterButton[];aliases:HotkeyAliases}|null>(null), [busy,setBusy]=useState(false), [drag,setDrag]=useState<string|null>(null);
  const value=draft??{buttons:p.casterButtons??[],aliases:p.hotkeyAliases??{}}, owner=connected!==false&&seat?.role==='director'&&p.control?.owner===seat.id;
  const edit=(buttons=value.buttons,aliases=value.aliases)=>setDraft({buttons,aliases});
  const patch=(id:string,change:Partial<CasterButton>)=>edit(value.buttons.map(b=>b.id===id?{...b,...change}:b));
  const move=(id:string,index:number)=>{const from=value.buttons.findIndex(b=>b.id===id);if(from<0||index<0||index>=value.buttons.length)return;const buttons=[...value.buttons], [button]=buttons.splice(from,1);buttons.splice(index,0,button);edit(buttons);};
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);try{await fn();}catch(e){notify(e instanceof Error?e.message:String(e),'error');}finally{setBusy(false);}};
  const defaults=(action:CasterButton['action'])=>action==='preview'?'live':action==='analysis-mode'?'off':action==='postgame-page'?'1':action==='player'?state.players[0]?.id??'':action==='ticker'?state.overlay.tickerText:'';
  return <section className="caster-controls" aria-label="自定义解说按钮"><header><h3>自定义解说按钮</h3><p>点击已保存按钮执行。节目、分析和赛后页先进入预监；TAKE 发布。附加快捷键沿用后台启用开关。</p></header>
    <div className="caster-pad">{(p.casterButtons??[]).map(b=><button key={b.id} disabled={!owner||busy} onClick={()=>void run(()=>executeCasterAction(ctx,`button-${b.id}`))}>{b.label}<small>{casterActionLabels[b.action]}{b.keys.length?` · ${b.keys.join(' / ')}`:''}</small></button>)}{!p.casterButtons?.length&&<p>展开配置，添加常用解说动作。</p>}</div>
    <details><summary>配置按钮与多组快捷键</summary><fieldset disabled={!owner||busy}>
      <div className="caster-aliases">{casterBaseActions.map(action=><label key={action}>{globalShortcutLabels[action]} · 附加键<input aria-label={`${globalShortcutLabels[action]}附加键`} value={(value.aliases[action]??[]).join(', ')} placeholder="最多 3 组，用逗号分隔" onChange={e=>edit(value.buttons,{...value.aliases,[action]:splitKeys(e.target.value)})}/></label>)}</div>
      <p>支持 Control+Shift+字母、Alt+Shift+字母、Control+Enter。主绑定和附加绑定全局去重。可拖动按钮条目排序，也可用上移／下移。</p>
      <div className="caster-button-list">{value.buttons.map((b,index)=><article key={b.id} draggable={owner&&!busy} onDragStart={e=>{if((e.target as Element).closest('input,select,textarea')){e.preventDefault();return;}setDrag(b.id);e.dataTransfer.setData('text/plain',b.id);}} onDragEnd={()=>setDrag(null)} onDragOver={e=>{if(drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(drag)move(drag,index);setDrag(null);}}>
        <span className="caster-drag" aria-label={`拖动 ${b.label}`}>↕ {index+1}</span><label>名称<input aria-label={`按钮 ${index+1} 名称`} maxLength={40} value={b.label} onChange={e=>patch(b.id,{label:e.target.value})}/></label>
        <label>动作<select aria-label={`按钮 ${index+1} 动作`} value={b.action} onChange={e=>{const action=e.target.value as CasterButton['action'];patch(b.id,{action,value:defaults(action)});}}>{Object.entries(casterActionLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
        {b.action==='preview'?<label>节目<select aria-label={`按钮 ${index+1} 参数`} value={b.value} onChange={e=>patch(b.id,{value:e.target.value})}>{casterScenes.map(s=><option key={s} value={s}>{sceneInfo[s].name}</option>)}</select></label>:b.action==='analysis-mode'?<label>分析<select aria-label={`按钮 ${index+1} 参数`} value={b.value} onChange={e=>patch(b.id,{value:e.target.value})}>{analysisModes.map(s=><option key={s} value={s}>{analysisLabels[s]}</option>)}</select></label>:b.action==='player'?<label>选手<select aria-label={`按钮 ${index+1} 参数`} value={b.value} onChange={e=>patch(b.id,{value:e.target.value})}><option value="">选择当前对局选手</option>{state.players.map(p=><option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>:b.action==='postgame-page'?<label>页码<select aria-label={`按钮 ${index+1} 参数`} value={b.value} onChange={e=>patch(b.id,{value:e.target.value})}>{[1,2,3].map(n=><option key={n}>{n}</option>)}</select></label>:b.action==='ticker'?<label>字幕<input aria-label={`按钮 ${index+1} 参数`} maxLength={300} value={b.value} onChange={e=>patch(b.id,{value:e.target.value})}/></label>:null}
        <label>快捷键<input aria-label={`按钮 ${index+1} 快捷键`} value={b.keys.join(', ')} placeholder="最多 3 组，用逗号分隔" onChange={e=>patch(b.id,{keys:splitKeys(e.target.value)})}/></label><div><button type="button" disabled={index===0} onClick={()=>move(b.id,index-1)}>上移</button><button type="button" disabled={index===value.buttons.length-1} onClick={()=>move(b.id,index+1)}>下移</button><button type="button" onClick={()=>edit(value.buttons.filter(x=>x.id!==b.id))}>删除</button></div>
      </article>)}</div>
      <div className="caster-config-actions"><button type="button" disabled={value.buttons.length>=24} onClick={()=>edit([...value.buttons,{id:`caster-${crypto.randomUUID()}`,label:'新解说按钮',action:'preview',value:'live',keys:[]}])}>添加解说按钮</button><button type="button" onClick={()=>edit([], {})}>重置自定义配置</button><button type="button" disabled={!draft} onClick={()=>setDraft(null)}>放弃修改</button><button type="button" disabled={!draft} onClick={()=>void run(async()=>{const checked=validateCasterConfiguration(p.hotkeys,value.aliases,value.buttons);await window.riftcastDesktop?.globalShortcuts({action:'disable'});await send({type:'production',command:{op:'settings',hotkeyAliases:checked.aliases,casterButtons:checked.buttons}});setDraft(null);notify('解说按钮与附加快捷键已保存；后台快捷键需重新启用');})}>保存解说配置</button></div>
    </fieldset></details>{!owner&&<p>取得主导播控制权后可配置和执行按钮。</p>}
  </section>;
}
