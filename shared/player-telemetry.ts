/** Absolute game-time deadlines, compatible with the League Broadcast timer model. */
export interface Cooldown {
  state: 'ready' | 'cooldown' | 'unknown' | 'unlearned';
  readyAt?: number;
  totalCooldown?: number;
  charges?: number;
}
export interface TelemetryStamp { gameTime: number; sampledAt: string; validForMs: number; source: 'api' | 'memory' | 'league-broadcast' }
export interface ItemCooldown { slot: number; itemId: number; cooldown: Cooldown }
export interface PlayerBuffs { baron?: boolean; elder?: boolean; baronExpiresAt?: number; elderExpiresAt?: number }
export interface DamageTotals { toChampions?: number; taken?: number; physicalToChampions?: number; magicToChampions?: number; trueToChampions?: number }

export function telemetryFresh(stamp: TelemetryStamp | undefined, gameTime: number, now = Date.now()): boolean {
  if (!stamp) return false;
  const age = now - Date.parse(stamp.sampledAt);
  return Number.isFinite(age) && age >= -1000 && age <= stamp.validForMs &&
    Number.isFinite(gameTime) && gameTime >= stamp.gameTime - .5 && gameTime - stamp.gameTime <= 30;
}

/** Never turn absent telemetry into an asserted ready state. */
export function cooldownView(cooldown: Cooldown | undefined, gameTime: number, fresh = true) {
  if (!fresh || !cooldown || cooldown.state === 'unknown') return { state: 'unknown', remaining: 0, fraction: 0, seconds: null } as const;
  if (cooldown.state === 'unlearned') return { state: 'unlearned', remaining: 0, fraction: 0, seconds: null } as const;
  if (cooldown.state === 'ready') return { state: 'ready', remaining: 0, fraction: 0, seconds: null } as const;
  if (!Number.isFinite(cooldown.readyAt) || cooldown.readyAt! < 0) return { state: 'unknown', remaining: 0, fraction: 0, seconds: null } as const;
  const remaining = Math.max(0, cooldown.readyAt! - gameTime);
  const total = cooldown.totalCooldown;
  return { state: remaining > 0 ? 'cooldown' : 'ready', remaining,
    fraction: remaining > 0 ? Number.isFinite(total) && total! > 0 ? Math.min(1, remaining / total!) : 1 : 0,
    seconds: remaining > 0 && remaining <= 10 ? Math.ceil(remaining) : null };
}

export function activeBuffs(buffs: PlayerBuffs | undefined, gameTime: number, fresh: boolean, dead: boolean) {
  const active = (kind: 'baron' | 'elder') => fresh && !dead && buffs?.[kind] === true &&
    (buffs[`${kind}ExpiresAt`] === undefined || buffs[`${kind}ExpiresAt`]! > gameTime);
  return { baron: active('baron'), elder: active('elder') };
}
