import { cachedResource } from './resource-url';

export interface ChampionSkin { num: number; name: string; parentSkin?: number }
export interface ResolvedSkin { num: number; artNum: number; name: string; image: string; chroma: boolean }
export function normalizedSkinId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100000 ? value : undefined;
}
export function skinCatalog(payload: unknown, champion: string): ChampionSkin[] {
  if (!/^[A-Za-z0-9]{2,40}$/.test(champion) || !payload || typeof payload !== 'object') return [];
  const record = (payload as { data?: Record<string, { id?: string; skins?: unknown }> }).data?.[champion];
  if (!record || record.id !== champion || !Array.isArray(record.skins) || record.skins.length > 10000) return [];
  const valid: ChampionSkin[] = record.skins.flatMap(value => {
    if (!value || typeof value !== 'object' || normalizedSkinId(value.num) === undefined || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200) return [];
    if (value.parentSkin !== undefined && normalizedSkinId(value.parentSkin) === undefined) return [];
    return [{ num: value.num, name: value.name, ...(value.parentSkin !== undefined ? { parentSkin: value.parentSkin } : {}) }];
  });
  const counts = new Map<number, number>(); for (const skin of valid) counts.set(skin.num, (counts.get(skin.num) ?? 0) + 1);
  return valid.filter(s => counts.get(s.num) === 1);
}
/** Skin IDs are champion-local num values. Unknown skins never fall back to the default appearance. */
export function resolveSkin(catalog: ChampionSkin[], champion: string, championName: string, id: unknown): ResolvedSkin | undefined {
  if (!/^[A-Za-z0-9]{2,40}$/.test(champion) || normalizedSkinId(id) === undefined) return;
  const matches = catalog.filter(s => s.num === id); if (matches.length !== 1) return;
  const skin = matches[0], visited = new Set<number>(); let art = skin;
  while (art.parentSkin !== undefined) {
    if (visited.has(art.num) || visited.size > 8) return; visited.add(art.num);
    const parents = catalog.filter(s => s.num === art.parentSkin); if (parents.length !== 1) return; art = parents[0];
  }
  return { num: skin.num, artNum: art.num, name: skin.name === 'default' ? `${championName} · 原生皮肤` : skin.name, chroma: skin.num !== art.num,
    image: cachedResource(`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion}_${art.num}.jpg`) };
}
