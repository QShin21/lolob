import type { BroadcastState, Side } from './types';

export const vdoRoles = ['上单', '打野', '中单', '下路', '辅助'] as const;
const aliases = [['上单','上路','TOP'], ['打野','JUNGLE'], ['中单','中路','MID','MIDDLE'], ['下路','射手','ADC','BOT','BOTTOM'], ['辅助','SUPPORT','UTILITY']];
export const vdoRoleIndex = (role: string) => aliases.findIndex(names => names.includes(role.toUpperCase()));
export interface VdoBinding { teamId: string; playerId: string; streamId: string }
export interface VdoConfig { version: 1; enabled: boolean; bindings: VdoBinding[] }
export interface VdoInvitation extends VdoBinding { teamName: string; playerName: string; role: string; inviteUrl: string; viewUrl: string }
export interface VdoFeed { side: Side; slot: number; teamId: string; playerId?: string; name: string; role: string; viewUrl?: string; reason?: string }
export interface VdoStatus { enabled: boolean; invitations: VdoInvitation[]; feeds: VdoFeed[]; warnings: string[] }
export const emptyVdoConfig = (): VdoConfig => ({ version: 1, enabled: false, bindings: [] });

/** Locally generated URLs only; opening the invitation remains the player's action. */
export function vdoUrls(streamId: string, label: string) {
  if (!/^[A-Za-z0-9]{16,64}$/.test(streamId)) throw new Error('远程摄像机标识无效');
  const invite = new URL('https://vdo.ninja/'), view = new URL('https://vdo.ninja/');
  invite.searchParams.set('push', streamId); invite.searchParams.set('label', label.slice(0, 100));
  view.searchParams.set('view', streamId); view.searchParams.set('cleanoutput', ''); view.searchParams.set('noaudio', '');
  return { inviteUrl: invite.href, viewUrl: view.href };
}
export function vdoStatus(state: BroadcastState, config: VdoConfig): VdoStatus {
  const invitations: VdoInvitation[] = [], feeds: VdoFeed[] = [], warnings: string[] = [];
  const sides = ['blue', 'red'] as const;
  for (const side of sides) {
    const teamId = state.match[`${side}TeamId`], team = state.teams.find(t => t.id === teamId);
    const members = team?.players ?? [];
    for (const member of members) {
      if (!member.id || members.filter(p => p.id === member.id).length !== 1) { warnings.push(`${team?.tag || side} · ${member.name} 的名单身份需确认`); continue; }
      const matches = config.bindings.filter(b => b.teamId === teamId && b.playerId === member.id);
      if (matches.length === 1) invitations.push({ ...matches[0], teamName: team?.name || teamId, playerName: member.name, role: member.role, ...vdoUrls(matches[0].streamId, member.name) });
    }
    for (let slot = 0; slot < 5; slot++) {
      const base = { side, slot, teamId, name: '', role: vdoRoles[slot] };
      let candidates = members.filter(p => vdoRoleIndex(p.role) === slot);
      if (state.phase === 'live' || state.phase === 'postgame') {
        const observed = state.players.filter(p => p.team === side && vdoRoleIndex(p.role) === slot);
        if (observed.length !== 1) { feeds.push({ ...base, reason: '当前分路选手尚未唯一确认' }); continue; }
        const p = observed[0];
        candidates = members.filter(m => p.registeredPlayerId ? m.id === p.registeredPlayerId : m.account ? m.account === p.id.replace(/^(live|lcu)-/, '') || m.account === p.name : m.name === p.name);
      }
      if (candidates.length !== 1 || !candidates[0].id || members.filter(m => m.id === candidates[0].id).length !== 1) { feeds.push({ ...base, reason: '名单身份或分路尚未唯一确认' }); continue; }
      const member = candidates[0], invitation = invitations.find(i => i.teamId === teamId && i.playerId === member.id);
      feeds.push({ ...base, playerId: member.id, name: member.name, ...(config.enabled && invitation ? { viewUrl: invitation.viewUrl } : { reason: config.enabled ? '请先生成该选手邀请链接' : '远程选手画面已停用' }) });
    }
  }
  return { enabled: config.enabled, invitations, feeds, warnings: [...new Set(warnings)] };
}
