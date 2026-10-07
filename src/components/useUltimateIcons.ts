import { cachedResource } from '../../shared/resource-url';
import { useEffect, useState } from 'react';

/** Static champion R artwork only; readiness and cooldown remain player telemetry. */
export type UltimateIcons = Record<string, string>;

const dragonOrigin = 'https://ddragon.leagueoflegends.com';
const patchPattern = /^\d+\.\d+\.\d+$/;
const championPattern = /^[A-Za-z][A-Za-z0-9]*$/;
const spellImagePattern = /^[A-Za-z0-9_-]+\.png$/;
const requests = new Map<string, Promise<string | undefined>>();

function loadUltimateIcon(version: string, championId: string): Promise<string | undefined> {
  const key = `${version}:${championId}`;
  const existing = requests.get(key);
  if (existing) return existing;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(cachedResource(`${dragonOrigin}/cdn/${version}/data/en_US/champion/${championId}.json`), {
        mode: 'cors', credentials: 'omit', cache: 'force-cache', signal: controller.signal,
      });
      if (!response.ok) return undefined;
      const payload = await response.json() as { data?: Record<string, { spells?: { image?: { full?: unknown } }[] }> };
      const filename = payload.data?.[championId]?.spells?.[3]?.image?.full;
      return typeof filename === 'string' && spellImagePattern.test(filename)
        ? cachedResource(`${dragonOrigin}/cdn/${version}/img/spell/${filename}`) : undefined;
    } catch { return undefined; }
    finally { window.clearTimeout(timeout); }
  })();
  requests.set(key, request);
  void request.then(icon => { if (!icon) requests.delete(key); });
  return request;
}

/** Share deduplicated official metadata requests across repeated roster renders. */
export function useUltimateIcons(version: string, championIds: string[]): UltimateIcons {
  const ids = [...new Set(championIds.filter(id => championPattern.test(id)))].sort();
  const signature = patchPattern.test(version) && ids.length ? `${version}:${ids.join(',')}` : '';
  const [result, setResult] = useState<{ signature: string; icons: UltimateIcons }>({ signature: '', icons: {} });
  useEffect(() => {
    if (!signature) return;
    let active = true;
    void Promise.all(ids.map(async id => [id, await loadUltimateIcon(version, id)] as const)).then(entries => {
      if (!active) return;
      const icons: UltimateIcons = {};
      for (const [id, icon] of entries) if (icon) icons[id] = icon;
      setResult({ signature, icons });
    });
    return () => { active = false; };
  }, [signature]);
  return signature && result.signature === signature ? result.icons : {};
}
