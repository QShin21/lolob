import type { BroadcastState, OverlaySettings, PlayerFeedControl, PlayerFeedPair, PlayerFeedSettings, Side } from './types';
import { bottomPlayers } from '../server/bottom-scoreboard';

export const playerFeedRoles = ['上单', '打野', '中单', '下路', '辅助'] as const;
export const playerFeedInterval = 5000;
export const emptyPlayerFeed = (): PlayerFeedSettings => ({ mode: 'image', imageUrl: '', cameraDeviceId: '', label: '' });

/** Upgrade the original two panels to the jungle slot without losing their settings. */
export function playerFeedPairs(overlay: OverlaySettings): PlayerFeedPair[] {
  return playerFeedRoles.map((_, index) => ({
    blue: { ...emptyPlayerFeed(), ...(overlay.playerFeedPairs?.[index]?.blue ?? (index === 1 ? overlay.playerFeeds?.blue : undefined)) },
    red: { ...emptyPlayerFeed(), ...(overlay.playerFeedPairs?.[index]?.red ?? (index === 1 ? overlay.playerFeeds?.red : undefined)) },
  }));
}
export function playerFeedControl(overlay: OverlaySettings): PlayerFeedControl {
  const value = overlay.playerFeedControl;
  return { mode: value?.mode === 'auto' ? 'auto' : 'manual', activeIndex: Number.isInteger(value?.activeIndex) && value!.activeIndex >= 0 && value!.activeIndex < 5 ? value!.activeIndex : 1,
    ...(Number.isFinite(value?.nextSwitchAt) ? { nextSwitchAt: value!.nextSwitchAt } : {}) };
}
export function activePlayerFeedPair(overlay: OverlaySettings): PlayerFeedPair {
  return playerFeedPairs(overlay)[playerFeedControl(overlay).activeIndex];
}
export function resolvedPlayerFeed(state: BroadcastState, side: Side, index = playerFeedControl(state.overlay).activeIndex): PlayerFeedSettings {
  const feed = playerFeedPairs(state.overlay)[index][side];
  const player = bottomPlayers(state, side)[index];
  const team = state.teams.find(team => team.id === state.match[`${side}TeamId`]);
  const member = team?.players.find(member => player?.name && member.name === player.name) ?? team?.players.find(member => member.role === playerFeedRoles[index]) ?? team?.players[index];
  return { ...feed, label: feed.label || player?.name || member?.name || '', imageUrl: feed.imageUrl || player?.portrait || member?.portrait || '' };
}
/** One server clock controls cameras, labels, program and preview together. */
export function tickPlayerFeeds(state: BroadcastState, now = Date.now()): boolean {
  const control = state.overlay.playerFeedControl;
  if (!control || control.mode !== 'auto') return false;
  if (state.programScene !== 'live' && state.previewScene !== 'live') {
    if (control.nextSwitchAt === undefined) return false;
    delete control.nextSwitchAt;
    return true;
  }
  if (control.nextSwitchAt === undefined) { control.nextSwitchAt = now + playerFeedInterval; return true; }
  if (now < control.nextSwitchAt) return false;
  // Resume with a complete five-second slot after a delayed heartbeat.
  control.activeIndex = (control.activeIndex + 1) % 5;
  control.nextSwitchAt = now + playerFeedInterval;
  return true;
}
