import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { Player } from '../shared/types';

const dataDirectory = process.env.RIFTCAST_DATA_DIR ? path.resolve(process.env.RIFTCAST_DATA_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
let pending: Promise<string | undefined> | undefined;
let cachedKey = '', cachedPath: string | undefined, retryAfter = 0;

/** Fetch each official portrait once; OCR polls only read the resulting local manifest. */
export async function prepareChampionPortraitManifest(players: Player[]): Promise<string | undefined> {
  const roster = players.filter(player => /^(blue|red)$/.test(player.team) && /^[A-Za-z][A-Za-z0-9]{1,40}$/.test(player.championId))
    .map(player => ({ team: player.team, championId: player.championId })).sort((a,b) => `${a.team}:${a.championId}`.localeCompare(`${b.team}:${b.championId}`));
  if (!roster.length || roster.length > 10) return;
  const key = JSON.stringify(roster);
  if (key === cachedKey && (cachedPath || Date.now() < retryAfter)) return cachedPath;
  if (pending) { await pending; return prepareChampionPortraitManifest(players); }
  pending = (async () => {
    try {
      const catalog = JSON.parse(await readFile(path.join(dataDirectory, 'champions.json'), 'utf8'));
      if (!/^\d+\.\d+\.\d+$/.test(catalog.version) || !Array.isArray(catalog.champions)) return;
      const folder = path.join(dataDirectory, 'spectator-portraits', catalog.version);
      await mkdir(folder, { recursive: true });
      const entries = await Promise.all(roster.map(async entry => {
        if (!catalog.champions.some((champion: {id?: string}) => champion.id === entry.championId)) return;
        const imagePath = path.join(folder, `${entry.championId}.png`);
        try { await access(imagePath); } catch {
          const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${catalog.version}/img/champion/${entry.championId}.png`, { signal: AbortSignal.timeout(4000) });
          if (!response.ok) return;
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 500000 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return;
          await writeFile(imagePath, bytes);
        }
        return { ...entry, imagePath };
      }));
      const usable = entries.filter(Boolean);
      if (!usable.length) return;
      const manifest = path.join(folder, `roster-${createHash('sha256').update(key).digest('hex').slice(0,16)}.json`);
      await writeFile(manifest, JSON.stringify({ version: catalog.version, portraits: usable }), 'utf8');
      return manifest;
    } catch { return; }
  })();
  try { cachedPath = await pending; cachedKey = key; retryAfter = Date.now() + 8000; return cachedPath; }
  finally { pending = undefined; }
}
