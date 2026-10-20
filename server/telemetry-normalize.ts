import type { Cooldown, DamageTotals, PlayerBuffs, TelemetryStamp } from '../shared/player-telemetry';
import type { Player } from '../shared/types';

type Json = Record<string, any>;
export const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const object = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeCooldown(value: unknown, time: number): Cooldown | undefined {
  if (!object(value)) return;
  const readyAt = nonnegative(value.readyAt) ? value.readyAt :
    nonnegative(value.cooldownRemaining) ? time + value.cooldownRemaining : undefined;
  const state = value.state === 'unlearned' || value.level === 0 && value.state !== 'unknown' ? 'unlearned' :
    value.state === 'unknown' ? 'unknown' :
    readyAt !== undefined ? readyAt > time ? 'cooldown' : 'ready' :
    value.state === 'ready' || value.isReady === true ? 'ready' : 'unknown';
  const total = value.totalCooldown ?? value.maxCooldown;
  return { state, ...(readyAt !== undefined ? { readyAt } : {}),
    ...(nonnegative(total) && total > 0 ? { totalCooldown: total } : {}),
    ...(Number.isInteger(value.charges) && value.charges >= 0 ? { charges: value.charges } : {}) };
}

export function normalizeDamage(value: unknown): DamageTotals | undefined {
  if (!object(value)) return;
  const out: DamageTotals = {};
  for (const key of ['toChampions', 'taken', 'physicalToChampions', 'magicToChampions', 'trueToChampions'] as const) {
    if (nonnegative(value[key])) out[key] = value[key];
  }
  return Object.keys(out).length ? out : undefined;
}

/** Whitelisted, explicitly supplied observer fields. Missing fields never become zero/ready. */
export function normalizeTelemetry(raw: Json, time: number, stamp: TelemetryStamp): Partial<Player> {
  const out: Partial<Player> = { telemetry: stamp };
  for (const key of ['health', 'maxHealth', 'resource', 'maxResource', 'experience', 'maxExperience'] as const)
    if (nonnegative(raw[key])) out[key] = raw[key];
  if (typeof raw.resourceType === 'string' && /^[A-Z_]{1,24}$/i.test(raw.resourceType)) out.resourceType = raw.resourceType;
  if (raw.experienceData && nonnegative(raw.experienceData.current) &&
    nonnegative(raw.experienceData.previousLevel) && nonnegative(raw.experienceData.nextLevel) &&
    raw.experienceData.nextLevel > raw.experienceData.previousLevel) {
    out.experience = Math.max(0, raw.experienceData.current - raw.experienceData.previousLevel);
    out.maxExperience = raw.experienceData.nextLevel - raw.experienceData.previousLevel;
  }
  if (typeof raw.isDead === 'boolean') out.isDead = raw.isDead;
  if (raw.isDead === true) {
    if (nonnegative(raw.respawnAt)) out.respawnAt = raw.respawnAt;
    else if (nonnegative(raw.respawnTimer)) out.respawnAt = time + raw.respawnTimer;
  }
  if (object(raw.buffs)) {
    const buffs: PlayerBuffs = {};
    for (const key of ['baron', 'elder'] as const) {
      if (typeof raw.buffs[key] === 'boolean') buffs[key] = raw.buffs[key];
      const expiry = raw.buffs[key + 'ExpiresAt'];
      if (nonnegative(expiry)) buffs[`${key}ExpiresAt`] = expiry;
    }
    if (Object.keys(buffs).length) out.buffs = buffs;
  }
  if (Array.isArray(raw.items)) {
    out.itemCooldowns = raw.items.flatMap((item: Json) => {
      if (!object(item) || !Number.isInteger(item.slot) || item.slot < 0 || item.slot > 6 ||
        !Number.isInteger(item.itemID) || item.itemID <= 0) return [];
      const cooldown = normalizeCooldown(item.cooldown ?? item, time);
      return cooldown && cooldown.state !== 'unknown' ? [{ slot: item.slot, itemId: item.itemID, cooldown }] : [];
    });
  }
  const damage = normalizeDamage(raw.damageStats??{
    toChampions:raw.totalDamageDealtToChampions,taken:raw.totalDamageTaken,
    physicalToChampions:raw.physicalDamageDealtToChampions,magicToChampions:raw.magicDamageDealtToChampions,trueToChampions:raw.trueDamageDealtToChampions,
  });
  if (damage) {
    out.telemetryDamage = damage;out.telemetryDamageSource = raw._damageStatsSource==='packets'&&stamp.source==='memory'?'packets':stamp.source === 'memory' ? 'memory' : 'api';
    if(out.telemetryDamageSource==='packets'&&typeof raw._damageStatsSession==='string'&&raw._damageStatsSession.length<=160&&nonnegative(raw._damageStatsSince)){
      out.telemetryDamageSession=raw._damageStatsSession;out.telemetryDamageSince=raw._damageStatsSince;
    }
  }
  return out;
}
