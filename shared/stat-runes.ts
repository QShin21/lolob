import type { Player } from './types';

// Official Data Dragon StatMods icons are bundled under public/runes for offline output.
export const STAT_RUNES: Record<number, { name: string; asset: string }> = {
  5001: { name: '成长生命值', asset: 'StatModsHealthScalingIcon.png' },
  5005: { name: '攻击速度', asset: 'StatModsAttackSpeedIcon.png' },
  5007: { name: '技能急速', asset: 'StatModsCDRScalingIcon.png' },
  5008: { name: '自适应之力', asset: 'StatModsAdaptiveForceIcon.png' },
  5010: { name: '移动速度', asset: 'StatModsMovementSpeedIcon.png' },
  5011: { name: '固定生命值', asset: 'StatModsHealthPlusIcon.png' },
  5013: { name: '韧性与减速抗性', asset: 'StatModsTenacityIcon.png' },
};
/** Shards may repeat in different slots; preserve their source order. */
export function selectedStatRuneIds(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return;
  const ids = value.map(v => typeof v === 'object' && v !== null ? (v as { id?: unknown }).id : v);
  return ids.every((id): id is number => typeof id === 'number' && Number.isInteger(id) && Object.hasOwn(STAT_RUNES, id)) ? ids : undefined;
}
export const lineupStatRunes = (player?: Player): number[] => selectedStatRuneIds(player?.statRuneIds) ?? [];
