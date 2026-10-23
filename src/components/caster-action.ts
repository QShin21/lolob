import type { StateContext } from '../../shared/types';
import { casterButtonCommand, casterBaseActions, type CasterBaseAction } from '../../shared/caster-controls';
import type { GlobalShortcutAction } from '../../shared/global-shortcuts';
import { api } from '../lib';

export async function executeCasterAction(ctx: Pick<StateContext, 'state'|'seat'|'connected'|'send'>, action: GlobalShortcutAction) {
  const {state,seat,connected,send}=ctx;
  if (connected === false || seat?.role !== 'director' || state.production?.control?.owner !== seat.id) throw new Error('请先取得主导播控制权');
  if (action.startsWith('button-')) {
    const button = state.production.casterButtons?.find(b => `button-${b.id}` === action);
    if (!button) throw new Error('解说按钮已移除');
    if (button.action === 'player' && !state.players.some(p => p.id === button.value)) throw new Error('此按钮的选手不在当前对局，请重新选择');
    const command = casterButtonCommand(button);
    if (command) { await send(command); return; }
    action = button.action as CasterBaseAction;
  }
  if (!casterBaseActions.includes(action as CasterBaseAction)) throw new Error('解说动作无效');
  if (action === 'take') { await send({type:'take'}); return; }
  if (action === 'live' || action === 'emergency') { await api('/api/obs/production',{method:'POST',body:JSON.stringify({action:action==='live'?'return-live':'emergency'})}); return; }
  await send({type:'production',command:{op:'immediate',action:action==='analysis'?'analysis-off':action==='feeds'?'feeds-off':'undo'}});
}
