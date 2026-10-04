import type { Player, PlayerUltimate, SummonerSpell } from '../shared/types';

type Json = Record<string, any>;
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const id = (v: unknown): v is number => number(v) && Number.isInteger(v) && v > 0;
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const object = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const safeIcon = (v: unknown): v is string => text(v) && (/^https?:\/\//.test(v) || /^\/(?!\/)/.test(v));

function spell(value: unknown): SummonerSpell {
  if (!object(value)) return { name: '' };
  const rawName = text(value.rawDisplayName) ? value.rawDisplayName : undefined;
  return { name: text(value.displayName) ? value.displayName : rawName || '', ...(rawName && rawName !== value.displayName ? { rawName } : {}), ...(id(value.id) ? { id: value.id } : {}) };
}

/** Only explicit data from this player (or an identity-matched active player) enters the HUD. */
export function normalizePlayerDetails(player: Json, active?: Json): Partial<Player> {
  const result: Partial<Player> = {};
  const spells = [spell(player.summonerSpells?.summonerSpellOne), spell(player.summonerSpells?.summonerSpellTwo)];
  if (spells.some(s => s.name || s.id)) result.summonerSpells = spells;
  if (number(player.scores?.wardScore)) result.visionScore = player.scores.wardScore;
  else if (number(player.visionScore)) result.visionScore = player.visionScore;
  for (const key of ['experience', 'maxExperience'] as const) {
    if (number(player[key])) result[key] = player[key];
    else if (active && number(active[key])) result[key] = active[key];
  }
  const rawUltimate = object(player.ultimate) ? player.ultimate : object(player.abilities?.R) ? player.abilities.R : object(active?.ultimate) ? active.ultimate : object(active?.abilities?.R) ? active.abilities.R : undefined;
  if (rawUltimate) {
    const level = number(rawUltimate.level) ? rawUltimate.level : number(rawUltimate.abilityLevel) ? rawUltimate.abilityLevel : undefined;
    const cooldown = number(rawUltimate.cooldownRemaining) ? rawUltimate.cooldownRemaining : undefined;
    const explicitState = ['ready', 'cooldown', 'unlearned', 'unknown'].includes(rawUltimate.state) ? rawUltimate.state as PlayerUltimate['state'] : undefined;
    // A learned ability alone gives no information about its current cooldown.
    const state = explicitState ?? (level === 0 ? 'unlearned' : typeof rawUltimate.isReady === 'boolean' ? rawUltimate.isReady ? 'ready' : 'cooldown' : cooldown !== undefined ? cooldown > 0 ? 'cooldown' : 'ready' : 'unknown');
    result.ultimate = { state, ...(level !== undefined ? { level } : {}), ...(cooldown !== undefined ? { cooldownRemaining: cooldown } : {}), ...(safeIcon(rawUltimate.icon) ? { icon: rawUltimate.icon } : {}) };
  }
  if (object(player.roleQuest)) {
    const quest: NonNullable<Player['roleQuest']> = {};
    if (typeof player.roleQuest.completed === 'boolean') quest.completed = player.roleQuest.completed;
    for (const key of ['progress', 'maxProgress'] as const) if (number(player.roleQuest[key])) quest[key] = player.roleQuest[key];
    if (safeIcon(player.roleQuest.icon)) quest.icon = player.roleQuest.icon;
    if (Object.keys(quest).length) result.roleQuest = quest;
  }
  const runes = player.runes;
  const selection: NonNullable<Player['runeSelection']> = {};
  for (const [source, target] of [['keystone', 'keystoneId'], ['primaryRuneTree', 'primaryTreeId'], ['secondaryRuneTree', 'secondaryTreeId']] as const) if (id(runes?.[source]?.id)) selection[target] = runes[source].id;
  if (Object.keys(selection).length) result.runeSelection = selection;
  if (Array.isArray(player.items) && player.items.some(item => object(item) && Number.isInteger(item.slot) && item.slot >= 0 && item.slot <= 6 && number(item.count))) {
    result.itemCounts = Array<number>(7).fill(0);
    for (const item of player.items) if (object(item) && Number.isInteger(item.slot) && item.slot >= 0 && item.slot <= 6 && number(item.count)) result.itemCounts[item.slot] = item.count;
  }
  return result;
}
