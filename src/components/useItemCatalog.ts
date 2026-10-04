import { useEffect, useState } from 'react';
import type { Champion } from '../../shared/types';

export interface ItemAsset {
  name: string;
  image: string;
  /** Data Dragon's static total purchase price; this is not a player's earned gold. */
  gold?: number;
}
export type ItemAssets = Record<number, ItemAsset>;
export type ItemCatalogStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
const dragonOrigin = 'https://ddragon.leagueoflegends.com';
const catalogRequests = new Map<string, Promise<ItemAssets | null>>();
const patchPattern = /^\d+\.\d+\.\d+$/;

export function dataDragonItemImage(version: string, id: number): string | undefined {
  return patchPattern.test(version) && Number.isInteger(id) && id > 0
    ? `${dragonOrigin}/cdn/${version}/img/item/${id}.png` : undefined;
}

function readCachedAssets(value: unknown, version: string): ItemAssets | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const assets: ItemAssets = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^\d+$/.test(key) || !raw || typeof raw !== 'object') continue;
    const item = raw as Partial<ItemAsset>;
    const id = Number(key);
    const image = dataDragonItemImage(version, id);
    if (!image || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 200) continue;
    assets[id] = { name: item.name, image, ...(typeof item.gold === 'number' && Number.isFinite(item.gold) && item.gold >= 0 ? { gold: item.gold } : {}) };
  }
  return Object.keys(assets).length ? assets : null;
}

function loadItemAssets(version: string): Promise<ItemAssets | null> {
  const existing = catalogRequests.get(version);
  if (existing) return existing;
  const request = (async () => {
    const cacheKey = `riftcast-item-catalog-zh_CN-v2-${version}`;
    try {
      const cached = readCachedAssets(JSON.parse(localStorage.getItem(cacheKey) || 'null'), version);
      if (cached) return cached;
    } catch { /* OBS and private browser sessions can disable local storage. */ }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${dragonOrigin}/cdn/${version}/data/zh_CN/item.json`, {
        mode: 'cors', credentials: 'omit', cache: 'force-cache', signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = await response.json() as { data?: Record<string, { name?: unknown; gold?: { total?: unknown } }> };
      const rawAssets = Object.fromEntries(Object.entries(payload.data || {}).map(([id, item]) => [id, { name: item?.name, gold: item?.gold?.total }]));
      const assets = readCachedAssets(rawAssets, version);
      if (assets) {
        try { localStorage.setItem(cacheKey, JSON.stringify(assets)); } catch { /* The shared in-memory cache remains usable. */ }
      }
      return assets;
    } catch { return null; }
    finally { window.clearTimeout(timeout); }
  })();
  catalogRequests.set(version, request);
  void request.then(items => { if (!items) catalogRequests.delete(version); });
  return request;
}

/** Share official item assets between the observer roster, selected-player focus and control panel. */
export function useItemCatalog(champions: Champion[]): { version: string; items: ItemAssets; status: ItemCatalogStatus } {
  const version = champions.map(champion => champion.image.match(/\/cdn\/(\d+\.\d+\.\d+)\//)?.[1]).find(Boolean) || '';
  const [catalog, setCatalog] = useState<{ version: string; items: ItemAssets | null }>({ version: '', items: null });
  useEffect(() => {
    if (!version) return;
    let active = true;
    void loadItemAssets(version).then(items => { if (active) setCatalog({ version, items }); });
    return () => { active = false; };
  }, [version]);
  if (!version) return { version, items: {}, status: 'idle' };
  if (catalog.version !== version) return { version, items: {}, status: 'loading' };
  return { version, items: catalog.items || {}, status: catalog.items ? 'ready' : 'unavailable' };
}
