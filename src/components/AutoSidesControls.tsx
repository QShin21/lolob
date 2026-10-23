import {useState}from'react';
import type{StateContext}from'../../shared/types';
import{parseRiotId}from'../../shared/player-identity';
export function AutoSidesControls({state,seat,connected,send,notify}:Pick<StateContext,'state'|'seat'|'connected'|'send'|'notify'>){
 const[busy,setBusy]=useState(false),owner=connected!==false&&seat?.role==='director'&&state.production?.control?.owner===seat.id;
 const teams=[state.teams.find(t=>t.id===state.match.blueTeamId),state.teams.find(t=>t.id===state.match.redTeamId)];
 return <section className="panel" aria-label="自动阵营识别" style={{padding:16}}><h3>按账号自动识别蓝红方</h3><label><input type="checkbox" aria-label="启用自动阵营识别" checked={state.production?.autoSides===true} disabled={!owner||busy} onChange={event=>{const autoSides=event.target.checked;setBusy(true);void send({type:'production',command:{op:'settings',autoSides}}).then(()=>notify(autoSides?'自动阵营识别已启用':'自动阵营识别已关闭')).catch(e=>notify(e.message,'error')).finally(()=>setBusy(false));}}/>启用自动阵营识别</label><p className="muted">双方各至少 3 个唯一完整 Riot ID 与同侧名单一致时，修正待播蓝红方；当前节目保留到下一次 TAKE。名单不完整、账号重复或匹配冲突时保持原配置。</p><p>{teams.map(t=>`${t?.name??'未选队伍'}：${t?.players.filter(p=>parseRiotId(p.account)).length??0} 个完整账号`).join(' · ')}</p><small>在队伍资料的账号栏填写 名称#TAG；显示姓名可独立编辑。</small></section>;
}
